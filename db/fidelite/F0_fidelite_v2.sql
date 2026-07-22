-- ============================================================================
-- F0 — FIDÉLITÉ v2 : socle base (barème réglable + crédit en deux temps)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE vers la review caisse.
--
-- ARCHITECTURE RETENUE : « pending dérivé, acquis écrit, caisse intouchée ».
--   Le tampon EN ATTENTE n'est écrit NULLE PART : il est dérivé du fait que
--   la commande existe en statut 'new'. Le tampon ACQUIS est écrit une seule
--   fois quand la caisse passe la commande en accepted/preparing/ready/
--   completed, par un RPC idempotent appelé par le SITE (jamais par la caisse).
--   → AUCUN trigger sur orders. AUCUNE logique fidélité dans la transaction
--     de la caisse. AUCUNE table nouvelle. AUCUNE colonne pending_stamps.
--   Refus d'une commande = la commande cesse de matcher 'new' → le tampon en
--     attente disparaît tout seul, ZÉRO écriture, ZÉRO ligne de code.
--
-- KILLSWITCH : tant que loyalty_cards.stamp_online_enabled = false (défaut),
--   ces migrations sont INERTES — le système se comporte exactement comme
--   aujourd'hui. Elles peuvent donc partir en production avant la décision
--   d'allumer. Activation = 1 UPDATE, sans déploiement.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- M1 — BARÈME sur loyalty_cards (table du site ; la caisse n'y touche pas)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.loyalty_cards
  ADD COLUMN stamp_credit_mode text NOT NULL DEFAULT 'per_amount'
    CHECK (stamp_credit_mode IN ('per_amount','per_order')),
  ADD COLUMN stamp_amount_step numeric(10,2) NOT NULL DEFAULT 50.00
    CHECK (stamp_amount_step > 0),
  ADD COLUMN stamp_amount_basis text NOT NULL DEFAULT 'goods'
    CHECK (stamp_amount_basis IN ('goods','total')),
  ADD COLUMN stamp_max_per_order smallint NOT NULL DEFAULT 2
    CHECK (stamp_max_per_order >= 1),
  ADD COLUMN stamp_online_enabled boolean NOT NULL DEFAULT false;

-- EXPLICATION LIGNE À LIGNE :
--  stamp_credit_mode   → 'per_amount' (1 tampon par tranche) ou 'per_order'
--                        (1 commande = 1 tampon). Le restaurateur bascule
--                        depuis /dashboard. Défaut = per_amount (décision 22.07).
--  stamp_amount_step   → la tranche en CHF. Défaut 50.00 : sur les 18 commandes
--                        RÉELLES du checkout (R-*), AUCUNE n'est sous 50 CHF
--                        hors livraison (médiane 56, moyenne 62.89) ; le cluster
--                        sous-50 de la base est 100 % synthétique (TEST-*).
--                        Réglable en un clic si le terrain dit autre chose.
--  stamp_amount_basis  → 'goods' = total_amount - delivery_fee (décision 22.07 :
--                        on récompense la consommation, pas le déplacement).
--  stamp_max_per_order → plafond de tampons par commande. Défaut 2 (décision
--                        22.07 : la carte récompense la FRÉQUENCE, pas le
--                        montant d'un événement unique).
--  stamp_online_enabled→ KILLSWITCH. false = pont inerte (comportement actuel).
-- Purement additive, 1 seule ligne en base (la carte Rialto), aucun backfill.
-- ROLLBACK : ALTER TABLE public.loyalty_cards
--   DROP COLUMN stamp_credit_mode, DROP COLUMN stamp_amount_step,
--   DROP COLUMN stamp_amount_basis, DROP COLUMN stamp_max_per_order,
--   DROP COLUMN stamp_online_enabled;


-- ─────────────────────────────────────────────────────────────────────────
-- M2 — IDEMPOTENCE : lien commande → tampon (table transactions)
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.transactions
  ADD COLUMN order_id uuid NULL REFERENCES public.orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX transactions_order_stamp_uniq
  ON public.transactions (order_id)
  WHERE order_id IS NOT NULL AND type = 'stamp_added';

CREATE INDEX transactions_order_id_idx
  ON public.transactions (order_id)
  WHERE order_id IS NOT NULL;

-- EXPLICATION :
--  order_id           → SEUL état ajouté par toute l'architecture. Son unique
--                       rôle : se souvenir que « cette commande a déjà crédité ».
--                       ON DELETE SET NULL : supprimer une commande ne détruit
--                       jamais l'historique de tampons du client.
--  index UNIQUE PARTIEL → LE verrou d'idempotence, garanti par Postgres et non
--                       par du code : une commande = au plus UNE ligne de
--                       crédit, même si 4 déclencheurs tombent dessus en même
--                       temps (polling 15 s, lookup fidélité, cron, retry
--                       Vercel). PARTIEL : les scans comptoir (order_id NULL)
--                       ne sont PAS contraints — le comptoir garde le droit de
--                       poser plusieurs lignes.
-- ROLLBACK : DROP INDEX transactions_order_id_idx;
--            DROP INDEX transactions_order_stamp_uniq;
--            ALTER TABLE public.transactions DROP COLUMN order_id;


-- ─────────────────────────────────────────────────────────────────────────
-- M3 — INDEX de lecture sur orders (SEUL objet partagé touché)
-- ─────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_customer_created
  ON public.orders (customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

-- EXPLICATION : sert les lectures « commandes récentes de ce client » (calcul
--  du pending dérivé + solidification). C'est un INDEX : aucune sémantique
--  modifiée, aucune colonne, aucune contrainte, aucune RLS, aucune
--  régénération de types côté caisse.
--  NB : volontairement SANS CONCURRENTLY — apply_migration s'exécute dans une
--  transaction, où CONCURRENTLY est interdit. À 34 lignes, la création est
--  instantanée et le verrou imperceptible.
-- ROLLBACK : DROP INDEX idx_orders_customer_created;


-- ─────────────────────────────────────────────────────────────────────────
-- M4 — RPC de solidification (le seul écrivain du crédit en ligne)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.credit_order_stamps(
  p_order_id uuid,
  p_customer_card_id uuid,
  p_stamps integer,
  p_source text DEFAULT 'order'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_card_id  uuid;
  v_current  int;
  v_program  uuid;
  v_required int;
  v_status   text;
  v_inserted int;
begin
  if p_stamps is null or p_stamps <= 0 then
    return jsonb_build_object('ok', true, 'credited', 0, 'reason', 'zero');
  end if;

  -- 1. Verrou de la ligne carte (même discipline que credit_stamp).
  select cc.id, coalesce(cc.current_stamps, 0), cc.card_id
    into v_card_id, v_current, v_program
  from customer_cards cc
  where cc.id = p_customer_card_id
  for update;

  if v_card_id is null then
    return jsonb_build_object('ok', false, 'error', 'Carte introuvable');
  end if;

  -- 2. Relecture INDÉPENDANTE du statut : le RPC ne fait jamais confiance à
  --    son appelant. Seul un statut solide autorise le crédit.
  select o.status into v_status from orders o where o.id = p_order_id;
  if v_status is null
     or v_status not in ('accepted','preparing','ready','completed') then
    return jsonb_build_object('ok', true, 'credited', 0, 'reason', 'not_settled');
  end if;

  select coalesce(lc.stamps_required, 10) into v_required
  from loyalty_cards lc where lc.id = v_program;
  v_required := coalesce(v_required, 10);

  -- 3. L'INSERT EST LE PORTIER : il vient AVANT toute mutation de compteur.
  --    ON CONFLICT DO NOTHING sur l'index unique partiel (M2) → rejouable à
  --    l'infini, un doublon ne peut structurellement pas créditer deux fois.
  insert into transactions (customer_card_id, order_id, type, value, source)
  values (p_customer_card_id, p_order_id, 'stamp_added', p_stamps, p_source)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'credited', 0, 'already', true);
  end if;

  -- 4. Incrément PLAFONNÉ. Jamais de reset, jamais de rewards_claimed+1,
  --    jamais d'insertion reward_claimed : le flux en ligne ne CONSOMME
  --    JAMAIS une récompense. La consommation reste un geste comptoir.
  update customer_cards
  set current_stamps = least(v_current + p_stamps, v_required)
  where id = p_customer_card_id;

  return jsonb_build_object(
    'ok', true,
    'credited', p_stamps,
    'new_stamps', least(v_current + p_stamps, v_required),
    'stamps_required', v_required
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.credit_order_stamps(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_order_stamps(uuid, uuid, integer, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_order_stamps(uuid, uuid, integer, text) TO service_role;

-- EXPLICATION : ACL calquée sur credit_stamp (service_role SEUL), surtout PAS
--  sur increment_stampify_stamps (cf. M6). search_path figé (anti-escalade).
--  Ce RPC ne peut PAS débloquer une récompense : c'est le 2e verrou de la
--  règle anti « donné-repris ».
-- ROLLBACK : DROP FUNCTION public.credit_order_stamps(uuid, uuid, integer, text);


-- ─────────────────────────────────────────────────────────────────────────
-- M5 — QUOTA COMPTOIR : n'compter QUE les scans (⚠️ touche le chemin caisse)
-- ─────────────────────────────────────────────────────────────────────────
-- Corps RE-CRÉÉ À L'IDENTIQUE de la version en production, avec UNE SEULE
-- modification, signalée en commentaire dans le corps ci-dessous.
CREATE OR REPLACE FUNCTION public.credit_stamp(
  p_customer_card_id uuid,
  p_source text DEFAULT 'scan'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_card_id uuid;
  v_current int;
  v_rewards int;
  v_program uuid;
  v_required int;
  v_multiplier int;
  v_added int;
  v_new int;
  v_reached boolean;
  v_count int;
  v_day_start timestamptz;
begin
  -- lock de la ligne carte (corrige le read-modify-write racé de Stampify)
  select cc.id, coalesce(cc.current_stamps, 0), coalesce(cc.rewards_claimed, 0), cc.card_id
    into v_card_id, v_current, v_rewards, v_program
  from customer_cards cc
  where cc.id = p_customer_card_id
  for update;

  if v_card_id is null then
    return jsonb_build_object('ok', false, 'error', 'Carte introuvable');
  end if;

  select coalesce(lc.stamps_required, 10) into v_required
  from loyalty_cards lc where lc.id = v_program;
  v_required := coalesce(v_required, 10);

  -- limite 3 tampons/jour — borne = minuit local Europe/Zurich (parité navigateur caisse)
  v_day_start := date_trunc('day', now() at time zone 'Europe/Zurich') at time zone 'Europe/Zurich';
  select count(*) into v_count from transactions
  where customer_card_id = p_customer_card_id
    and type = 'stamp_added'
    and created_at >= v_day_start
    -- ⬇⬇ SEULE MODIFICATION F0/M5 : le quota anti-abus COMPTOIR ne compte plus
    --    les crédits issus des commandes en ligne. Sans cela, 2 commandes en
    --    ligne dans la journée satureraient le quota et feraient refuser un
    --    scan comptoir LÉGITIME. Conservateur : exclut une source qui
    --    n'existait pas hier → comportement comptoir strictement identique
    --    tant que le flux en ligne est éteint.
    and coalesce(source, 'scan') <> 'order';
  if v_count >= 3 then
    return jsonb_build_object('ok', false, 'error', 'Limite atteinte : maximum 3 tampons par jour pour ce client.');
  end if;

  -- multiplicateur de la promo active la plus récente
  select coalesce(p.multiplier, 1) into v_multiplier
  from promotions p
  where p.card_id = v_program
    and p.is_active = true
    and p.start_date <= now()
    and p.end_date >= now()
  order by p.created_at desc
  limit 1;
  v_multiplier := greatest(coalesce(v_multiplier, 1), 1);

  v_added := v_multiplier;
  v_new := v_current + v_added;
  v_reached := v_new >= v_required;

  -- limite 1 récompense / 7 jours glissants, vérifiée AVANT toute écriture (corrige le bug Stampify)
  if v_reached then
    select count(*) into v_count from transactions
    where customer_card_id = p_customer_card_id
      and type = 'reward_claimed'
      and created_at >= now() - interval '7 days';
    if v_count >= 1 then
      return jsonb_build_object('ok', false, 'error', 'Ce client a déjà réclamé une récompense cette semaine.');
    end if;
  end if;

  update customer_cards
  set current_stamps = case when v_reached then 0 else v_new end,
      rewards_claimed = case when v_reached then v_rewards + 1 else v_rewards end
  where id = p_customer_card_id;

  insert into transactions (customer_card_id, type, value, source)
  values (p_customer_card_id, 'stamp_added', v_added, p_source);

  if v_reached then
    insert into transactions (customer_card_id, type, value, source)
    values (p_customer_card_id, 'reward_claimed', 1, p_source);
  end if;

  return jsonb_build_object(
    'ok', true,
    'stamps_added', v_added,
    'new_stamps', case when v_reached then 0 else v_new end,
    'stamps_required', v_required,
    'reward_earned', v_reached
  );
end;
$function$;

-- EXPLICATION : signature, type de retour et JSON de sortie STRICTEMENT
--  inchangés → /api/scan/credit et ScanClient.tsx ne bougent pas d'une ligne.
--  Les GRANT existants (service_role) survivent à CREATE OR REPLACE.
-- ROLLBACK : re-CREATE OR REPLACE de la version antérieure (corps ci-dessus
--  sans la ligne « and coalesce(source,'scan') <> 'order' »).


-- ─────────────────────────────────────────────────────────────────────────
-- M6 — SÉCURITÉ (PRIORITAIRE) : fermer le crédit public non gardé
-- ─────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.increment_stampify_stamps(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_stampify_stamps(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_stampify_stamps(uuid, uuid) FROM authenticated;

-- EXPLICATION (constaté en base le 22.07.2026, pg_proc.proacl) :
--  droits actuels = « =X/postgres | postgres=X | anon=X | authenticated=X |
--  service_role=X » → exécutable par PUBLIC et par anon.
--  La fonction est SECURITY DEFINER, SANS search_path figé (proconfig vide),
--  et elle incrémente customer_cards.current_stamps SANS AUCUNE limite
--  anti-abus, SANS écrire dans transactions (donc sans laisser de trace).
--  → Porte ouverte qui contourne intégralement le modèle v2 et fausse les
--    compteurs silencieusement ; le SECURITY DEFINER sans search_path est en
--    plus un vecteur d'escalade de privilèges classique.
--  service_role conserve l'exécution (aucun appelant côté site : vérifié par
--  grep ; à re-vérifier côté loyalty-cards s'il pointe encore sur cette base).
-- ROLLBACK : GRANT EXECUTE ON FUNCTION public.increment_stampify_stamps(uuid, uuid)
--            TO anon, authenticated;   -- (déconseillé)


-- ============================================================================
-- IMPACTS GLOBAUX (pour la review)
-- - CAISSE : ZÉRO ligne de code à changer, ZÉRO trigger ajouté sur orders,
--   ZÉRO logique fidélité dans sa transaction. Le seul objet partagé touché
--   est un INDEX de lecture (M3). M5 modifie une fonction du chemin COMPTOIR
--   (pas caisse) sans changer sa signature ni son contrat de retour.
-- - SITE : aucun comportement modifié tant que stamp_online_enabled = false.
-- - RLS : aucune policy ajoutée ni modifiée. Aucun GRANT élargi ; M6 en RETIRE.
-- - PUBLICATION realtime : inchangée.
-- - VOLUMES : 1 ligne loyalty_cards, ~34 lignes orders, 3 lignes transactions.
--
-- ACTIVATION (hors DDL, après F1-F4 livrés et testés) :
--   UPDATE public.loyalty_cards SET stamp_online_enabled = true
--   WHERE id = 'f4cb1a3f-fc5c-40eb-87db-8d2c2b0a8b5f';
-- ============================================================================
