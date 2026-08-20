-- ============================================================================
-- F7 — RETRAIT DES TAMPONS SUR RENVERSEMENT DE DÉCISION
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE vers la review caisse (21.08.2026).
--   ⚠️ Ce statut DOIT être mis à jour le jour de l'exécution (le piège
--   F3b : son en-tête a menti pendant un mois).
--
-- ────────────────────────────────────────────────────────────────────────
-- L'AMENDEMENT (décision Augustin, 20.08.2026, NON NÉGOCIABLE)
-- ────────────────────────────────────────────────────────────────────────
-- L'invariant historique « un tampon solidifié ne se reprend JAMAIS » est
-- AMENDÉ : il ne vaut plus pour un RENVERSEMENT DE DÉCISION DU
-- RESTAURATEUR. Quand une commande ACCEPTÉE est ensuite REFUSÉE, le client
-- revient exactement à l'état d'avant cette commande.
--
-- RAISON (procès-verbal) : l'exploit est réel et c'est le CLIENT qui le
-- déclenche — il commande, attend l'acceptation qui crédite son tampon,
-- appelle pour faire annuler, et garde le tampon. Dix fois = une pizza
-- gratuite. Il ÉTAIT DÉJÀ matérialisé en base : au 20.08.2026, 4 lignes
-- `stamp_added` valant 5 tampons portaient un order_id dont la commande
-- était `cancelled` — R-2026-042 (1), R-2026-043 (1), R-2026-045 (1),
-- R-2026-051 (2) — sur les DEUX cartes les plus avancées :
-- f5c4bb7f-9ecc-4050-9127-27ba119cad93 (HTEF9Z5K, 9/10) et
-- f6abe121-5918-4a92-a785-3b3d498dfb1d (PSPVUQ7X, 9/10).
-- 8 commandes sur 52 avaient fait accepted→cancelled ; 2 le retour.
--
-- ⚠️ CE FAIT N'EST PLUS VÉRIFIABLE PAR UNE SIMPLE REQUÊTE DEPUIS LE
-- 20.08 22:26 UTC : le balayage manuel de ce soir-là a fait passer 37
-- commandes `cancelled` en `completed`, y compris ces quatre. La requête
-- « lignes stamp_added dont la commande est cancelled » renvoie donc 0
-- aujourd'hui, et une session future pourrait en conclure que l'exploit
-- était imaginaire. Le parcours réel reste lisible dans
-- order_status_history (chercher une transition cancelled→completed).
-- Les ids sont écrits en dur ci-dessus pour cette raison — c'est le
-- piège F3b appliqué à F7 elle-même.
--
-- PRINCIPE GÉNÉRAL (Augustin 21.08) : LE RETRAIT NE TOUCHE JAMAIS QU'À CE
-- QUE CETTE COMMANDE A APPORTÉ, JAMAIS À CE QUI VIENT D'AILLEURS. Un
-- tampon gagné au comptoir est légitime (le client s'est déplacé) : il
-- n'est jamais confisqué au passage.
--
-- CE QUI N'EST PAS TOUCHÉ : le refus DIRECT (new → cancelled, sans
-- acceptation). Les tampons y sont en attente, jamais solidifiés ;
-- l'affichage montre les acquis en plein et les en-attente en grisé. Ce
-- chemin est correct, F7 ne le modifie en RIEN.
--
-- ────────────────────────────────────────────────────────────────────────
-- CE QU'EST MATÉRIELLEMENT UNE RÉCOMPENSE (établi sur pièces, 20-21.08)
-- ────────────────────────────────────────────────────────────────────────
-- AUCUN CODE N'EST GÉNÉRÉ. La récompense fidélité n'est pas un objet,
-- c'est un ÉTAT : `reward_available` est recalculé à chaque lecture
-- (`solde >= palier`), rien n'est stocké. `generatePromoCode` a 3
-- appelants (anniversaire, loterie, roue), AUCUN venant du palier ;
-- aucune fonction PG n'émet de code ; aucune table voucher/redemption
-- n'existe ; `reward_unlocked` est le SEUL template de gain sans {{code}}.
--   ⇒ FAIRE REDESCENDRE LE SOLDE **EST** L'INVALIDATION DE LA RÉCOMPENSE.
--     Il n'y a rien d'autre à révoquer. C'est ce qui rend F7 simple.
--
-- Les deux chemins de crédit se comportent en SENS OPPOSÉ au palier :
--   · credit_order_stamps (EN LIGNE) : plafonne, la carte STATIONNE à
--     10/10. Jamais de reset, jamais de rewards_claimed+1, jamais de
--     ligne reward_claimed, jamais de SMS.
--   · credit_stamp (COMPTOIR) : au seuil, current_stamps = 0,
--     rewards_claimed +1, ligne reward_claimed, SMS reward_unlocked, et
--     l'écran caisse affiche « Récompense gagnée ! » DEVANT le client.
--   ⇒ Une commande en ligne ne peut JAMAIS déclencher l'échange.
--   ⇒ Le sous-cas « récompense échangée mais pas consommée » N'EXISTE PAS
--     dans ce système (le seuil est atteint et détruit dans le même
--     UPDATE ; aucune colonne claimed_at/redeemed_at ; aucun bouton
--     « récompense remise » sur /scan ; le vocabulaire est au passé
--     accompli partout). Le modèle à deux temps existe pour la LOTERIE
--     (claimed_at + bouton « Lot remis »), pas pour la fidélité.
--
-- ============================================================================
-- ⚠️ QUESTIONS À LA CAISSE — réponse attendue AVEC le GO
-- ============================================================================
-- Q1 — TRIGGER NON BLOQUANT : À FAIRE ACTER EXPLICITEMENT.
--   `servato-caisse/ARCHITECTURE.md` pose une ligne rouge : « l'écriture
--   du statut ne doit JAMAIS être otage du débit ». F7 pose un trigger
--   AFTER UPDATE sur `orders`, donc DANS votre transaction. Nous le
--   rendons non bloquant par construction (voir bloc 3) :
--     · SET lock_timeout = '3s' sur la fonction, STRICTEMENT sous vos 8 s
--       (`statement_timeout` du rôle authenticated) — un verrou occupé
--       lève 55P03 chez nous AVANT que votre statement n'expire ;
--     · handler d'exception sur LISTE NOMMÉE (55P03, 40P01, 23514, 23503,
--       raise_exception) qui avale et laisse le refus passer ;
--     · `query_canceled` (57014) N'EST PAS attrapé — l'avaler ne sauverait
--       rien (Postgres réannule au statement suivant) et consommerait
--       votre budget de temps pour rien ;
--     · le trigger n'écrit JAMAIS sur `orders` (sinon `trg_orders_updated_at`
--       ferait réapparaître la commande refusée sur votre écran).
--   Confirmez-vous que ce dispositif respecte votre ligne rouge ?
--   Si NON : nous retirons le trigger et ne gardons que le filet cron —
--   au prix d'une fenêtre d'exploitation de plusieurs minutes.
--
-- Q2 — MUTATION DE LA LIGNE DE JOURNAL (autorisée par Augustin 21.08,
--   portée ici pour votre information car elle répond à votre crainte).
--   Vous écriviez que la trace « transaction sur commande annulée » est
--   VOULUE et qu'il ne faut pas l'effacer. F7 ne l'efface pas : il fait
--   BASCULER la ligne de `stamp_added` vers `stamp_reversed`. Identifiant,
--   order_id, source et horodatage sont CONSERVÉS. La trace ne devient
--   pas invisible, elle devient EXPLICITE : « ce tampon a été repris ».
--   C'est l'inverse d'un effacement.
--
-- Q3 — RIEN SUR VOTRE ÉCRAN. Conformément à la doctrine (aucune donnée
--   client sur l'écran caisse), F7 n'ajoute AUCUN affichage côté caisse :
--   ni solde, ni alerte, ni message de retrait. Confirmez-vous ?
--
-- ============================================================================
-- ⚠️ GARDE OBLIGATOIRE : cette migration touche `orders` (trigger).
-- ============================================================================
SET lock_timeout = '5s';

-- ────────────────────────────────────────────────────────────────────────
-- BLOC 1 — LE VOCABULAIRE : un seul type ajouté
-- ────────────────────────────────────────────────────────────────────────
-- `stamp_reversed` = miroir strict de `stamp_added` (anglais, snake_case,
-- participe passé — conventions de la base). Une SEULE valeur est ajoutée,
-- volontairement :
--
-- POURQUOI PAS de type `reward_cancelled` ? Parce que F7 ne touche JAMAIS
-- à une récompense déjà comptée (cf. bloc 2, branche « reward_consumed »).
-- Le sous-cas qui l'exigerait n'existe pas dans ce système.
--
-- ⚠️ AVERTISSEMENT POUR LES SESSIONS FUTURES — SI un jour on décide
-- d'invalider une récompense DÉJÀ comptée, la neutralisation « en
-- douceur » est un PIÈGE GRAVE : le quota « 1 récompense / 7 jours » de
-- credit_stamp ne lit QUE la colonne `type` (ni value, ni source). Mettre
-- value = 0 ou changer la source laisse la ligne compter, et le `return`
-- du quota sort AVANT le crédit — donc :
--   (1) ce n'est pas un report de récompense, c'est un GEL TOTAL : le
--       client ne peut plus accumuler AUCUN tampon au comptoir 168 h ;
--   (2) pendant ce gel, chaque commande en ligne consomme quand même la
--       clé d'idempotence pour ZÉRO tampon → jusqu'à 2 tampons perdus
--       DÉFINITIVEMENT par commande, sans aucune alerte ;
--   (3) le décompte part du created_at de la ligne, pas de l'invalidation.
-- Seules deux voies fonctionnent : DELETE, ou mutation du `type`.
-- « C'est exactement le genre de correctif qui punit la victime »
-- (Augustin, 21.08).

ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('stamp_added', 'points_added', 'reward_claimed',
                  'stamp_reversed'));

COMMENT ON CONSTRAINT transactions_type_check ON public.transactions IS
  'F7 (21.08.2026) : ajout de stamp_reversed — une ligne de crédit dont '
  'la commande a été refusée après acceptation BASCULE vers ce type. La '
  'ligne n''est jamais supprimée : id, order_id, source et created_at '
  'sont conservés, la trace devient explicite. Effet secondaire VOULU : '
  'les 4 filtres du système (quota 3/jour, quota 7 jours, index unique '
  'd''idempotence, pré-filtre dejaFait du settle) filtrent tous sur le '
  'type — une ligne basculée en sort donc automatiquement, ce qui LIBÈRE '
  'la clé d''idempotence pour une éventuelle ré-acceptation.';

-- ────────────────────────────────────────────────────────────────────────
-- BLOC 2 — LA FONCTION DE CONVERGENCE (le cœur)
-- ────────────────────────────────────────────────────────────────────────
-- Ce n'est PAS un gestionnaire d'événement (« retire »), c'est un
-- RÉCONCILIATEUR (« aligne ») : l'état DÛ découle du STATUT COURANT.
--   · statut solide  ⇒ dû = 1 ligne stamp_added, tampons au crédit
--   · statut non solide ⇒ dû = ligne basculée, tampons repris
-- Propriété : idempotent ET rejouable à l'infini, dans les deux sens.
-- C'est ce qui permet au trigger (immédiat) et au cron (filet) d'appeler
-- exactement la même chose sans jamais compter double.

CREATE OR REPLACE FUNCTION public.rialto_sync_order_stamps(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
-- ⚠️ STRICTEMENT sous les 8 s de statement_timeout du rôle authenticated
-- (la caisse) : un verrou occupé doit lever 55P03 ICI avant que SON
-- statement n'expire. service_role n'a AUCUN timeout par défaut — sans
-- cette ligne, le site pourrait geler le bouton REFUSER sans borne.
SET lock_timeout TO '3s'
AS $function$
declare
  v_status         text;
  v_order_customer uuid;
  v_solide         boolean;
  v_tx_id          uuid;
  v_tx_type        text;
  v_tx_value       int;
  v_tx_created     timestamptz;
  v_card_id        uuid;
  v_card_customer  uuid;
  v_current        int;
  v_program        uuid;
  v_required       int;
  v_enabled        boolean;
  v_effet          int;
begin
  -- (1) VERROU SUR LA COMMANDE D'ABORD.
  -- Ordre de verrouillage à TROIS niveaux, amendé par F7 :
  --   orders → customer_cards → transactions
  -- (CLAUDE.md n'en énonçait que deux. L'INSERT ... ON CONFLICT DO NOTHING
  -- de credit_order_stamps est un verrou d'attente sur la ligne
  -- transactions : la verrouiller AVANT la carte produit un interblocage
  -- 40P01 prouvable.)
  select o.status, o.customer_id
    into v_status, v_order_customer
  from orders o
  where o.id = p_order_id
  for share;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'commande_introuvable');
  end if;

  -- MIROIR de SOLID_STATUSES (src/lib/loyalty/settle.ts) et de l'étape (1)
  -- de credit_order_stamps. Toute évolution se répercute aux TROIS.
  -- Liste POSITIVE volontairement (jamais un complément) : le mode de
  -- défaillance d'une liste positive est bénin (on ne retire pas), celui
  -- d'un complément est catastrophique (retrait indu sur un futur statut).
  v_solide := v_status in ('accepted','preparing','ready','completed');

  -- (2) LECTURE NON VERROUILLÉE de la ligne de journal, à seule fin de
  -- connaître la carte. Elle sera RELUE sous verrou en (4) — cette double
  -- lecture ne doit JAMAIS être « simplifiée » : c'est elle qui empêche un
  -- double retrait concurrent (deux appels simultanés retirant chacun leur
  -- part, 9 → 7 au lieu de 9 → 8).
  select t.customer_card_id, t.type
    into v_card_id, v_tx_type
  from transactions t
  where t.order_id = p_order_id
    and t.type in ('stamp_added','stamp_reversed')
  limit 1;

  -- SORTIE ANTICIPEE AVANT TOUT VERROU (amendement 21.08, lot CL1) : si
  -- l'etat est deja convergent, inutile de verrouiller la carte. Le filet
  -- cron appelle ce RPC en masse — sans cette sortie, il verrouillerait
  -- des cartes pour ne rien faire. Lecture NON verrouillee : en course on
  -- peut lire un type perime et sortir en no-op a tort ; la divergence est
  -- alors transitoire et le passage suivant la reprend. Un no-op errone
  -- n'ecrit JAMAIS rien — meme propriete que la sortie 'aucune_ligne'.
  -- La porte definitive reste en (5), sous verrou.
  if v_card_id is not null
     and ((v_solide and v_tx_type = 'stamp_added')
          or (not v_solide and v_tx_type = 'stamp_reversed')) then
    return jsonb_build_object('ok', true, 'action', 'deja_aligne',
                              'status', v_status, 'type', v_tx_type,
                              'sans_verrou', true);
  end if;

  if v_card_id is null then
    -- Aucune ligne : rien n'a jamais été crédité pour cette commande.
    -- Le crédit initial reste la seule affaire de credit_order_stamps.
    return jsonb_build_object('ok', true, 'action', 'aucune_ligne');
  end if;

  -- (3) VERROU SUR LA CARTE.
  select cc.id, cc.customer_id, coalesce(cc.current_stamps, 0), cc.card_id
    into v_card_id, v_card_customer, v_current, v_program
  from customer_cards cc
  where cc.id = v_card_id
  for update;

  if v_card_id is null then
    return jsonb_build_object('ok', false, 'error', 'carte_introuvable');
  end if;

  -- Appariement carte ↔ commande (miroir de l'étape 3 du crédit).
  if v_order_customer is not null
     and v_card_customer is distinct from v_order_customer then
    return jsonb_build_object('ok', false, 'error', 'appariement_invalide');
  end if;

  select coalesce(lc.stamps_required, 10),
         coalesce(lc.stamp_online_enabled, false)
    into v_required, v_enabled
  from loyalty_cards lc where lc.id = v_program;
  v_required := coalesce(v_required, 10);

  -- (4) RELECTURE DE LA LIGNE, SOUS VERROU, APRÈS la carte.
  select t.id, t.type, t.value, t.created_at
    into v_tx_id, v_tx_type, v_tx_value, v_tx_created
  from transactions t
  where t.order_id = p_order_id
    and t.type in ('stamp_added','stamp_reversed')
  for update;

  if v_tx_id is null then
    return jsonb_build_object('ok', true, 'action', 'aucune_ligne');
  end if;

  -- (5) DÉJÀ CONVERGENT ? Le portier de l'idempotence, dans les DEUX sens.
  if (v_solide and v_tx_type = 'stamp_added')
     or (not v_solide and v_tx_type = 'stamp_reversed') then
    return jsonb_build_object('ok', true, 'action', 'deja_aligne',
                              'status', v_status, 'type', v_tx_type);
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- SENS 1 — RETRAIT (la commande n'est plus solide)
  -- ══════════════════════════════════════════════════════════════════
  if not v_solide then
    -- GARDE (d) — LA RÉCOMPENSE A-T-ELLE DÉJÀ ÉTÉ CONSOMMÉE ?
    -- Prédicat : une ligne reward_claimed sur CETTE carte, POSTÉRIEURE au
    -- crédit de CETTE commande. Servi par l'index existant
    -- transactions_card_type_created_idx (customer_card_id, type,
    -- created_at). Comparaison entre timestamptz uniquement
    -- (customer_cards.created_at est SANS fuseau — piège).
    -- ⚠️ NE JAMAIS utiliser rewards_claimed > 0 : compteur nu, sans date,
    -- il bloquerait tout retrait à vie.
    if exists (
      select 1 from transactions r
      where r.customer_card_id = v_card_id
        and r.type = 'reward_claimed'
        and r.created_at >= v_tx_created
    ) then
      -- La pizza est partie. On ne reprend RIEN : l'invariant historique
      -- tient exactement ici (décision Augustin). Le solde est de toute
      -- façon reparti de 0 au reset, les tampons de cette commande n'y
      -- sont plus. On laisse AUSSI la ligne reward_claimed intacte : le
      -- client a eu sa pizza, le quota 7 jours doit s'appliquer
      -- normalement. La ligne de crédit N'EST PAS basculée — elle reste
      -- le témoin que cette commande a bien produit un tampon consommé.
      return jsonb_build_object('ok', true, 'action', 'reward_consomme',
                                'retire', 0);
    end if;

    -- PLANCHER ZÉRO — miroir exact du plafond least(...) du crédit.
    -- EN BASE, jamais dans l'affichage : aucun écran ne clampe (un solde
    -- négatif afficherait « −1 tampon » et « Encore 11 tampons »).
    -- On ne retire QUE ce que cette commande a apporté, et jamais plus
    -- que ce qui reste (principe général Augustin 21.08).
    v_effet := least(coalesce(v_tx_value, 0), v_current);
    if v_effet < 0 then v_effet := 0; end if;

    -- Le killswitch NE bloque PAS le retrait : c'est une CORRECTION, pas
    -- un crédit. Couper le pont ne doit pas laisser des tampons indus.
    -- (Asymétrie volontaire — il bloque la restauration, voir SENS 2.)

    update customer_cards
       set current_stamps = v_current - v_effet
     where id = v_card_id;

    -- La ligne BASCULE. Le journal consigne l'EFFET RÉEL (pas le dû
    -- théorique) : sinon une restauration ultérieure rendrait plus que ce
    -- qui a été pris.
    update transactions
       set type = 'stamp_reversed',
           value = -v_effet
     where id = v_tx_id;

    return jsonb_build_object('ok', true, 'action', 'retire',
                              'retire', v_effet,
                              'nouveau_solde', v_current - v_effet);
  end if;

  -- ══════════════════════════════════════════════════════════════════
  -- SENS 2 — RESTAURATION (la commande redevient solide)
  -- ══════════════════════════════════════════════════════════════════
  -- Cas ATTESTÉ en production : R-2026-043 a fait
  -- new → cancelled → accepted → cancelled.
  -- Le montant restitué vient du JOURNAL, JAMAIS d'un recalcul : le
  -- barème a changé (step 40 aujourd'hui) et une commande ancienne
  -- recalculée donnerait un nombre différent de ce qui avait été crédité
  -- (preuve : R-2026-016 porte 1 au journal, 2 au recalcul).
  if not v_enabled then
    -- Killswitch coupé : on ne CRÉDITE jamais. La ligne reste basculée,
    -- le filet cron re-convergera au rallumage.
    return jsonb_build_object('ok', true, 'action', 'killswitch_off');
  end if;

  v_effet := abs(coalesce(v_tx_value, 0));
  -- Plafond de carte — miroir de least(v_current + p, v_required).
  v_effet := least(v_current + v_effet, v_required) - v_current;
  if v_effet < 0 then v_effet := 0; end if;

  update customer_cards
     set current_stamps = v_current + v_effet
   where id = v_card_id;

  update transactions
     set type = 'stamp_added',
         value = v_effet
   where id = v_tx_id;

  return jsonb_build_object('ok', true, 'action', 'restaure',
                            'restaure', v_effet,
                            'nouveau_solde', v_current + v_effet);
end;
$function$;

REVOKE ALL ON FUNCTION public.rialto_sync_order_stamps(uuid) FROM public;
REVOKE ALL ON FUNCTION public.rialto_sync_order_stamps(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.rialto_sync_order_stamps(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.rialto_sync_order_stamps(uuid) TO service_role;
-- Parité avec credit_order_stamps / credit_stamp : postgres + service_role
-- UNIQUEMENT. La caisse n'appelle rien — c'est le trigger qui agit pour
-- elle, avec les droits du propriétaire (SECURITY DEFINER).

COMMENT ON FUNCTION public.rialto_sync_order_stamps(uuid) IS
  'F7 (21.08.2026) : aligne les tampons d''une commande sur son STATUT '
  'COURANT, dans les deux sens. Idempotente et rejouable. Appelée par le '
  'trigger trg_orders_sync_stamps (immédiat) ET par le filet cron '
  'loyalty-settle (rattrapage). Ne touche JAMAIS à une récompense déjà '
  'consommée, ne descend JAMAIS sous zéro, ne recalcule JAMAIS un montant '
  '(le journal fait foi — le barème a changé depuis les premiers crédits).';

-- ────────────────────────────────────────────────────────────────────────
-- BLOC 3 — LE TRIGGER, NON BLOQUANT PAR CONSTRUCTION
-- ────────────────────────────────────────────────────────────────────────
-- Pourquoi un trigger et pas un appel depuis le site : la caisse a le
-- droit d'UPDATE orders.status mais AUCUN droit sur transactions ni
-- customer_cards, et ne peut appeler aucun RPC (EXECUTE réservé à
-- postgres/service_role). Un appel côté site ne se déclencherait donc
-- JAMAIS quand la caisse refuse depuis son écran — le cas exact qui nous
-- occupe. Le précédent existe : log_order_status_change est déjà un
-- trigger SECURITY DEFINER qui écrit dans une table interdite à la caisse.

CREATE OR REPLACE FUNCTION public.trg_sync_order_stamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  begin
    perform public.rialto_sync_order_stamps(new.id);
  exception
    -- LISTE NOMMÉE ET RESTREINTE — surtout PAS `when others`.
    --   55P03 lock_not_available     : verrou occupé (notre lock_timeout)
    --   40P01 deadlock_detected      : interblocage
    --   23514 check_violation        : CHECK inattendu
    --   23503 foreign_key_violation  : carte/commande disparue
    --   raise_exception              : garde métier
    -- ⚠️ 57014 query_canceled N'EST PAS LISTÉ, VOLONTAIREMENT : c'est le
    -- statement_timeout de la caisse. L'avaler ne sauve rien (Postgres
    -- réannule au statement suivant, le refus échouerait quand même) et
    -- consommerait son budget de temps pour rien.
    when lock_not_available or deadlock_detected or check_violation
      or foreign_key_violation or raise_exception then
      raise warning '[F7] sync tampons non appliquée pour % : % (%)',
        new.id, sqlerrm, sqlstate;
      -- Le filet cron rattrapera. La décision du restaurateur passe.
  end;
  return new;
end;
$function$;

-- AFTER UPDATE OF status : ne s'arme que sur un vrai changement de statut.
-- Le trigger n'écrit JAMAIS sur `orders` (sinon trg_orders_updated_at
-- ferait remonter la commande refusée sur l'écran caisse).
DROP TRIGGER IF EXISTS trg_orders_sync_stamps ON public.orders;
CREATE TRIGGER trg_orders_sync_stamps
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  -- AMENDEMENT 21.08 (lot CL1, cloture du service) : le trigger ne s'arme
  -- QUE sur une BASCULE DE SOLIDITE, pas sur tout changement de statut.
  -- Sans cette clause, la cloture nocturne (accepted -> completed) armerait
  -- le trigger sur chaque commande du lot : chacune serait un no-op
  -- LOGIQUE ('deja_aligne') mais PAS un no-op de VERROUS — la porte
  -- d'idempotence est APRES les deux FOR UPDATE, donc chaque no-op
  -- verrouillerait une carte en exclusif jusqu'au COMMIT du lot. Il n'y a
  -- que 5 cartes dans toute la base : une volee en verrouillerait la
  -- moitie. Ici, accepted -> completed devient STRICTEMENT inerte.
  --   accepted->cancelled  : oui->non  = ARME (raison d'etre de F7)
  --   cancelled->accepted  : non->oui  = ARME (restauration, cas atteste)
  --   new->cancelled       : non->non  = JAMAIS arme (refus direct, que F7
  --                                      s'engage a ne pas modifier — la
  --                                      clause le rend structurellement
  --                                      inatteignable au lieu de compter
  --                                      sur un return)
  --   accepted->completed  : oui->oui  = JAMAIS arme (la cloture)
  --   accepted->preparing  : oui->oui  = JAMAIS arme (progression)
  -- ATTENTION : c'est un QUATRIEME miroir de SOLID_STATUSES (settle.ts,
  -- etape 1 de credit_order_stamps, et etape (1) de
  -- rialto_sync_order_stamps). Toute evolution du vocabulaire se
  -- repercute aux QUATRE. Le mode de defaillance en cas de derive est
  -- benin : le trigger ne s'arme plus, donc pas de retrait — et le filet
  -- cron rattrape.
  WHEN (
    (old.status IN ('accepted','preparing','ready','completed'))
      IS DISTINCT FROM
    (new.status IN ('accepted','preparing','ready','completed'))
  )
  EXECUTE FUNCTION public.trg_sync_order_stamps();

-- ============================================================================
-- HARNAIS DE TEST — EN TRANSACTION ANNULÉE (patron F0)
-- ============================================================================
-- ⚠️ À exécuter AVANT la migration, sur la base réelle : BEGIN … ROLLBACK
-- n'écrit RIEN. C'est le SEUL moyen de prouver la garde « récompense
-- consommée » : le cas ne s'est JAMAIS produit en production (0 ligne
-- reward_claimed depuis l'origine, rewards_claimed = 0 sur les 5 cartes).
-- Il n'est donc pas observable — il doit être fabriqué.
--
-- BEGIN;
--   -- Fixtures : une carte à 8, une commande acceptée créditée de 2.
--   -- (ids à substituer au moment du test)
--   -- CAS 1 — RETRAIT NOMINAL (le cas d'Augustin)
--   --   carte 8 → commande +2 → 10 ; UPDATE orders SET status='cancelled'
--   --   ATTENDU : solde 8, ligne type='stamp_reversed' value=-2,
--   --             reward_available redevient false.
--   -- CAS 2 — IDEMPOTENCE DU RETRAIT
--   --   rappeler rialto_sync_order_stamps(order) 3 fois
--   --   ATTENDU : action='deja_aligne', solde INCHANGÉ à 8.
--   -- CAS 3 — RESTAURATION (ré-acceptation)
--   --   UPDATE orders SET status='accepted'
--   --   ATTENDU : solde 10, ligne 'stamp_added' value=2. Puis 3 rappels :
--   --             'deja_aligne', solde inchangé.
--   -- CAS 4 — PLANCHER ZÉRO
--   --   carte à 1, commande valant 2, refus
--   --   ATTENDU : solde 0 (jamais -1), value = -1 (l'effet RÉEL).
--   -- CAS 5 — RÉCOMPENSE CONSOMMÉE (garde d)
--   --   insérer une ligne reward_claimed POSTÉRIEURE au crédit, refuser
--   --   ATTENDU : action='reward_consomme', solde INCHANGÉ, ligne de
--   --             crédit NON basculée, ligne reward_claimed INTACTE.
--   -- CAS 6 — RÉCOMPENSE ANTÉRIEURE (ne doit PAS déclencher la garde)
--   --   ligne reward_claimed ANTÉRIEURE au crédit
--   --   ATTENDU : retrait normal.
--   -- CAS 7 — TAMPON DE COMPTOIR PRÉSERVÉ (principe général 21.08)
--   --   carte 8 → commande +1 → 9 → scan comptoir +1 → 10 ; refus
--   --   ATTENDU : solde 9. On ne défait QUE la contribution de la
--   --             commande, jamais le tampon gagné au comptoir.
--   -- CAS 8 — REFUS DIRECT (chemin à ne pas casser)
--   --   commande new → cancelled, jamais créditée
--   --   ATTENDU : action='aucune_ligne', RIEN écrit nulle part.
--   -- CAS 9 — KILLSWITCH COUPÉ
--   --   stamp_online_enabled=false : le RETRAIT s'applique quand même ;
--   --   la RESTAURATION répond 'killswitch_off' sans créditer.
--   -- CAS 11 — CLOTURE INERTE (amendement CL1) : une commande creditee
--   --   passe accepted -> completed
--   --   ATTENDU : le trigger NE SE DECLENCHE PAS DU TOUT (le WHEN ne
--   --             s'arme pas), solde et transactions inchanges, aucun
--   --             warning [F7] au log.
--   -- CAS 12 — CONTROLE NEGATIF DE MASSE : forcer cancelled -> completed
--   --   sur une commande dont le tampon a ete repris
--   --   ATTENDU : re-credit (SENS 2). C'est le comportement CORRECT de
--   --             F7 — et la demonstration de pourquoi CL1 doit refuser
--   --             de toucher une commande `cancelled`.
--   -- CAS 10 — LA CAISSE N'EST JAMAIS BLOQUÉE
--   --   session A : verrouiller customer_cards FOR UPDATE et attendre ;
--   --   session B : UPDATE orders SET status='cancelled'
--   --   ATTENDU : B réussit en ~3 s (warning F7 au log), le refus passe.
-- ROLLBACK;

-- ============================================================================
-- ROLLBACK COMPLET (dans l'ordre inverse ; lock_timeout aussi — TR1b)
-- ============================================================================
-- SET lock_timeout = '5s';
-- DROP TRIGGER IF EXISTS trg_orders_sync_stamps ON public.orders;
-- DROP FUNCTION IF EXISTS public.trg_sync_order_stamps();
-- DROP FUNCTION IF EXISTS public.rialto_sync_order_stamps(uuid);
--
-- ⚠️ COMPENSATION OBLIGATOIRE AVANT DE RESTAURER LE CHECK. Un rollback nu
-- laisserait des lignes 'stamp_reversed' que le CHECK restauré rejette, ET
-- des cartes débitées dont la clé d'idempotence est libre : à la
-- ré-acceptation, credit_order_stamps recréditerait → DOUBLE crédit.
-- Rebasculer d'abord toutes les lignes, et re-créditer les cartes :
--
-- WITH remises AS (
--   UPDATE public.transactions t
--      SET type = 'stamp_added', value = abs(value)
--    WHERE t.type = 'stamp_reversed'
--   RETURNING t.customer_card_id, abs(t.value) AS v
-- ), cumul AS (
--   SELECT customer_card_id, sum(v) AS total FROM remises
--   GROUP BY customer_card_id
-- )
-- UPDATE public.customer_cards cc
--    SET current_stamps = least(
--          coalesce(cc.current_stamps,0) + c.total,
--          coalesce((SELECT lc.stamps_required FROM public.loyalty_cards lc
--                     WHERE lc.id = cc.card_id), 10))
--   FROM cumul c WHERE cc.id = c.customer_card_id;
--
-- ALTER TABLE public.transactions DROP CONSTRAINT transactions_type_check;
-- ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
--   CHECK (type IN ('stamp_added','points_added','reward_claimed'));

-- ============================================================================
-- CE QUI SUIT, HORS DDL (à livrer avec l'exécution)
-- ============================================================================
-- 1. FILET CRON (code TS, src/app/api/cron/loyalty-settle/route.ts) :
--    balayer les commandes dont `updated_at >= now() - 30 jours` et dont
--    l'état du journal diverge du statut, puis appeler le RPC.
--    · fenêtre sur `updated_at` (l'horloge du RENVERSEMENT), JAMAIS sur
--      `created_at` (l'horloge de la commande) : un renversement peut
--      survenir « sans limite de délai » après la commande ;
--    · 30 jours parce que la plus longue panne de cron connue de ce projet
--      est de 13 jours (401 silencieux du 22.07 au 04.08). Une fenêtre se
--      dimensionne sur l'incident VÉCU, pas sur l'incident espéré ;
--    · sans ce filet, toute exception avalée par le trigger deviendrait
--      une perte DÉFINITIVE (rien ne se rejouerait).
-- 2. AUCUN SMS, AUCUN PUSH. Contrôle négatif de recette : `sms_logs`
--    INCHANGÉ après un refus déclenchant un retrait (décision
--    contractuelle 19.07.2026 — order_cancelled interdit sur ce flux).
--    Second contrôle négatif : `orders.updated_at` NON modifié par F7.
-- 3. BRÈCHE ASSUMÉE, documentée au backlog (décision Augustin 21.08) :
--    entre le crédit et le refus, si le client fait scanner sa carte au
--    comptoir, le tampon devient une pizza. Le trigger réduit la fenêtre
--    à quelques secondes ; il ne la ferme pas. La fermer exigerait une
--    « porte au comptoir » (vérification avant chaque scan) — REFUSÉE :
--    « refuser une pizza légitime devant un client à cause d'un hoquet de
--    verrou est un échec bien pire qu'une perte rare de l'ordre du franc ».
-- 3bis. INVARIANT DECOUVERT LE 21.08, A NE JAMAIS OUBLIER :
--    TOUTE ECRITURE DE MASSE FAISANT PASSER DES COMMANDES VERS UN STATUT
--    SOLIDE EST UN ORDRE DE CREDIT POUR F7. F7 est un reconciliateur
--    pilote par le statut courant : cancelled -> completed declenche le
--    SENS 2 (restauration des tampons). Contrefactuel : si F7 avait ete
--    en base depuis le 03.08, le balayage du 20.08 aurait RE-CREDITE les
--    5 tampons fantomes qu'elle venait de retirer, en 17 minutes, sans un
--    mot dans les logs. Une cloture, un import, un replay ou une
--    reparation ne doivent JAMAIS toucher une commande `cancelled` sans
--    decision explicite. C'est ce que le lot CL1
--    (db/orders/CL1_cloture_service.sql) garantit par sa liste positive.
-- 4. PAS DE RÉTROACTIF sur les tampons fantômes existants (décision
--    Augustin). Le grand ménage (docs/GO_LIVE.md) doit remettre à zéro
--    les deux cartes concernées EN MÊME TEMPS qu'il purge les commandes
--    de test — sinon les tampons survivraient aux commandes.
-- ============================================================================
