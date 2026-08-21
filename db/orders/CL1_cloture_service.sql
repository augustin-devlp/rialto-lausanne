-- ============================================================================
-- CL1 — CLÔTURE DU SERVICE PRÉCÉDENT (« clôture nocturne »)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE vers la review caisse (21.08.2026).
--   ⚠️ Mettre ce statut à jour LE JOUR de l'exécution (piège F3b).
--
-- ────────────────────────────────────────────────────────────────────────
-- LE BESOIN (décision Augustin 21.08, actée)
-- ────────────────────────────────────────────────────────────────────────
-- Rien ne fait jamais sortir une commande de l'état « acceptée » : elles
-- s'accumulent sur l'écran de la caisse. Chaque nuit, les commandes du
-- service écoulé passent en `completed` — l'écran repart vierge.
-- C'est de l'HYGIÈNE D'ÉTAT, pas de la comptabilité : aucun montant n'est
-- déplacé, aucun tampon créé ni détruit.
--
-- ⚠️ NOM TROMPEUR ASSUMÉ : l'écriture n'a pas lieu la nuit. Le plan Vercel
-- n'autorise qu'une exécution quotidienne par cron ; la clôture est
-- GREFFÉE sur /api/cron/loyalty-settle, planifié « 30 9 * * * » UTC, soit
-- 11:30 en heure d'été suisse et 10:30 en hiver. La FRONTIÈRE, elle, est
-- bien à 05:00 locales : on clôt « tout ce qui précède la fin du service
-- précédent », quelle que soit l'heure à laquelle on le constate.
--
-- ════════════════════════════════════════════════════════════════════════
-- ⚠️⚠️ CE QUI S'EST PASSÉ LE 20.08 ET QUI JUSTIFIE LA GARDE ÉLARGIE
-- ════════════════════════════════════════════════════════════════════════
-- La passe manuelle du 20.08.2026 (22:09→22:26 UTC) n'a PAS clos 52
-- commandes acceptées. Mesuré sur order_status_history :
--     accepted  → completed :  15 commandes, 1 054.00 CHF
--     cancelled → completed :  37 commandes, 2 175.50 CHF   ⚠️
-- 37 commandes REFUSÉES sont devenues « terminées ». Le chiffre
-- d'affaires du dashboard (src/app/api/dashboard/summary/route.ts,
-- const `revenue`)
-- ne filtre QUE `status !== 'cancelled'` : ces 2 175.50 CHF de refus sont
-- désormais comptés comme du CA.
--
-- LEÇON, ET ELLE COMMANDE LA CONCEPTION : le geste naturel de l'opérateur
-- est « je balaie l'écran », pas « je clos les acceptées ». Un automate
-- qui reproduirait ce geste reproduirait le dégât. La garde ne peut donc
-- PAS se limiter à `new` : elle doit être une LISTE POSITIVE de statuts
-- clôturables, et TOUT le reste est interdit — `new` (jamais décidée),
-- `cancelled` (décision inverse), `completed` (déjà close).
-- ════════════════════════════════════════════════════════════════════════
--
-- ⚠️ QUESTIONS À LA CAISSE (réponse attendue avec le GO)
--   Q1 — UN AUTOMATE DEVIENT ÉCRIVAIN DE STATUT. Votre doctrine écrite
--     (actionsCommande.ts) réserve la progression preparing/ready/completed
--     au « futur moteur automatique, qui dérive la phase à la lecture sans
--     jamais écrire de statut ». CL1 écrit `completed`. C'est la vraie
--     nouveauté de ce lot — pas le fait de toucher `orders`. Acceptez-vous
--     cette exception, bornée à la clôture du service écoulé ?
--   Q2 — EFFET ÉCRAN SANS EUPHÉMISME. `completed` est hors de
--     STATUTS_AFFICHES (useCommandesEnDirect.ts) : la commande SORT du
--     fetch, elle n'est pas seulement masquée. « Tout afficher » ne la
--     ramène pas. RÉIMPRIMER LE TICKET et CHANGER LA DÉCISION deviennent
--     structurellement inatteignables. Acceptez-vous que la réimpression
--     disparaisse ~6 h 30 après l'acceptation (borne basse) ?
--   Q3 — AUCUN DROIT NOUVEAU N'EST DEMANDÉ. `authenticated` garde son
--     UPDATE colonnaire (status, cancellation_reason, printed_at) ;
--     l'EXECUTE de cette fonction est réservé à `service_role`. Rien ne
--     change chez vous. Confirmez-vous ?
--   Q4 — Souhaitez-vous une mention « clôturée automatiquement » quelque
--     part côté caisse, ou le silence convient-il ?
--
-- ⚠️ GARDE OBLIGATOIRE : touche `orders`.
-- ============================================================================
SET lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.rialto_cloture_service(
  p_restaurant_id uuid,
  p_limit         int     DEFAULT 50,
  p_dry_run       boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
-- STRICTEMENT sous les 8 s de statement_timeout du rôle authenticated : un
-- verrou occupé doit lever 55P03 ICI avant que la caisse n'expire.
SET lock_timeout TO '3s'
AS $function$
declare
  -- LISTE POSITIVE — miroir de SOLID_STATUSES (src/lib/loyalty/settle.ts)
  -- PRIVÉ de 'completed'. JAMAIS un complément (`status <> 'new'`) : c'est
  -- un raisonnement par complément qui a produit le balayage du 20.08.
  v_cibles      constant text[] := array['accepted','preparing','ready'];
  v_fin_service timestamptz;
  v_closes      jsonb;
  v_reste       int;
begin
  -- ══ GARDE-FOU 1 — EXPLICITE ET BRUYANTE ═══════════════════════════════
  -- Ce n'est pas un `AND status <> 'new'` décoratif : c'est un ÉCHEC, levé
  -- AVANT toute écriture, si la liste cible venait à être élargie par
  -- inadvertance. Une commande jamais décidée qui deviendrait « terminée »
  -- serait une commande perdue en silence.
  if v_cibles && array['new','cancelled','completed'] then
    raise exception
      '[CL1] statut interdit dans la liste cible (%) : new, cancelled et '
      'completed ne sont JAMAIS clôturables', v_cibles;
  end if;

  -- ══ FRONTIÈRE : fin du service précédent = 05:00 Europe/Zurich ════════
  -- Le CASE n'est pas décoratif : l'endpoint accepte un déclenchement
  -- MANUEL (x-cron-secret). Appelé à 00h41, sans le CASE, la frontière
  -- tomberait 4 h DANS LE FUTUR et clôrait une commande acceptée deux
  -- minutes plus tôt. 05:00 est sûr vis-à-vis des bascules d'heure : ne
  -- JAMAIS descendre la frontière dans la plage 02:00–03:00.
  select case when now() > f then f else f - interval '1 day' end
    into v_fin_service
  from (
    select (date_trunc('day', now() at time zone 'Europe/Zurich')
            + interval '5 hours') at time zone 'Europe/Zurich' as f
  ) x;

  -- ══ GARDE-FOU 3 — SIGNER, AVANT l'UPDATE, DANS LA MÊME TRANSACTION ════
  -- Le trigger trg_orders_status_history écrit la ligne d'historique
  -- lui-même, une seule, à l'instant exact de la transition, en lisant
  -- request.jwt.claims->>'email'. En service_role ce claim est vide : sans
  -- cette ligne, le journal des transitions deviendrait à moitié anonyme
  -- (c'est exactement ce qui s'est passé le 20.08 : 52 lignes changed_by
  -- IS NULL, impossible de savoir QUI a fait la passe).
  -- · FUSION des claims existants : on n'écrase ni role ni sub.
  -- · is_local = true OBLIGATOIRE — la connexion est mutualisée
  --   (Supavisor) : un set_config de session signerait les requêtes
  --   d'autres clients.
  perform set_config(
    'request.jwt.claims',
    (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      || jsonb_build_object('email', 'cron-cloture'))::text,
    true
  );

  if p_dry_run then
    select coalesce(jsonb_agg(jsonb_build_object(
             'order_number', o.order_number, 'status', o.status)), '[]'::jsonb)
      into v_closes
    from orders o
    where o.restaurant_id = p_restaurant_id
      and o.status = any(v_cibles)
      and coalesce(
            (select max(h.changed_at) from order_status_history h
              where h.order_id = o.id and h.new_status = any(v_cibles)),
            o.created_at) < v_fin_service
    limit p_limit;
    return jsonb_build_object('ok', true, 'dry_run', true,
                              'frontiere', v_fin_service, 'closes', v_closes);
  end if;

  with candidates as (
    select o.id
      from orders o
     where o.restaurant_id = p_restaurant_id
       -- (A) LISTE POSITIVE.
       and o.status = any(v_cibles)
       -- (B) ANCRE TEMPORELLE : la DERNIÈRE entrée en statut solide, avec
       -- repli sur created_at pour les commandes antérieures au trigger
       -- d'historique. `updated_at` serait un faux ami : il bouge aussi
       -- pour printed_at, attribution, pricing_adjustments.
       and coalesce(
             (select max(h.changed_at) from order_status_history h
               where h.order_id = o.id and h.new_status = any(v_cibles)),
             o.created_at) < v_fin_service
     order by o.created_at
     limit p_limit
     -- Volée bornée + une ligne que la caisse est en train de modifier
     -- n'est pas attendue : elle sera reprise au prochain passage.
     for update of o skip locked
  ), maj as (
    update orders o
       set status = 'completed'
      from candidates c
     where o.id = c.id
       -- (C) CEINTURE réévaluée À L'ÉCRITURE : en READ COMMITTED, un
       -- UPDATE bloqué par un écrivain concurrent réévalue son WHERE sur
       -- la nouvelle version de la ligne. Un refus posé par la caisse
       -- pendant le run sort donc du lot tout seul. C'est aussi ce qui
       -- rend le rejeu idempotent.
       and o.status = any(v_cibles)
    returning o.order_number
  )
  select coalesce(jsonb_agg(order_number), '[]'::jsonb) into v_closes from maj;

  -- ══ AUTO-CONTRÔLE : le seul témoin possible de la mort du cron ════════
  -- Une valeur non nulle après un passage réussi prouve que la clôture ne
  -- fonctionne plus. Précédent : 401 silencieux du 22.07 au 04.08, treize
  -- jours, jamais détecté.
  select count(*) into v_reste
    from orders o
   where o.restaurant_id = p_restaurant_id
     and o.status = any(v_cibles)
     and coalesce(
           (select max(h.changed_at) from order_status_history h
             where h.order_id = o.id and h.new_status = any(v_cibles)),
           o.created_at) < v_fin_service - interval '24 hours';

  return jsonb_build_object(
    'ok', true,
    'frontiere', v_fin_service,
    'closes', v_closes,
    'nb_closes', jsonb_array_length(v_closes),
    'restantes_de_plus_de_24h', v_reste
  );
end;
$function$;

REVOKE ALL ON FUNCTION public.rialto_cloture_service(uuid,int,boolean)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rialto_cloture_service(uuid,int,boolean)
  TO service_role;

COMMENT ON FUNCTION public.rialto_cloture_service(uuid,int,boolean) IS
  'CL1 (21.08.2026) : clôt les commandes du service écoulé (accepted, '
  'preparing, ready → completed) dont la dernière entrée en statut solide '
  'précède 05:00 Europe/Zurich. Liste POSITIVE : new, cancelled et '
  'completed ne sont JAMAIS touchés (le balayage manuel du 20.08 avait '
  'écrasé 37 refus — 2 175.50 CHF passés en CA). Signe ses écritures '
  '« cron-cloture » via request.jwt.claims. Bornée, idempotente, '
  'rejouable.';

-- ============================================================================
-- HARNAIS DE TEST — EN TRANSACTION ANNULÉE
-- ============================================================================
-- BEGIN;
--   -- CAS 1 — NOMINAL : une commande 'accepted' entrée en solide hier soir
--   --   ATTENDU : status='completed', UNE ligne d'historique,
--   --             changed_by='cron-cloture'.
--   -- CAS 2 — GARDE 'new' : une commande 'new' créée il y a 3 jours
--   --   ATTENDU : INTOUCHÉE. (Et si la liste cible était élargie à 'new',
--   --             la fonction LÈVE au lieu d'écrire.)
--   -- CAS 3 — GARDE 'cancelled' : le cas du 20.08
--   --   ATTENDU : INTOUCHÉE. C'est LE test de non-régression du dégât.
--   -- CAS 4 — SERVICE EN COURS : une commande acceptée APRÈS 05:00 ce matin
--   --   ATTENDU : INTOUCHÉE (l'ancre est postérieure à la frontière).
--   -- CAS 5 — IDEMPOTENCE : rejouer 3 fois
--   --   ATTENDU : nb_closes=0 aux passages 2 et 3, aucune ligne
--   --             d'historique supplémentaire.
--   -- CAS 6 — DÉCLENCHEMENT MANUEL À 00h41 (le piège du CASE)
--   --   ATTENDU : la frontière retombe sur 05:00 de la VEILLE, une
--   --             commande acceptée à 00h39 n'est PAS close.
--   -- CAS 7 — SIGNATURE : changed_by='cron-cloture' sur 100 % des lignes
--   --   écrites, ET le chemin caisse continue de produire
--   --   'caisse-rialto@servato.ch' à l'identique (contrôle négatif).
--   -- CAS 8 — CONTRÔLES NÉGATIFS : transactions INCHANGÉE,
--   --   customer_cards.current_stamps INCHANGÉ, sms_logs INCHANGÉ,
--   --   count(status='cancelled') INCHANGÉ, count(status='new') INCHANGÉ.
--   -- CAS 9 — LA CAISSE N'EST JAMAIS BLOQUÉE : session A verrouille une
--   --   ligne orders ; ATTENDU : SKIP LOCKED la saute, aucun blocage.
-- ROLLBACK;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- SET lock_timeout = '5s';
-- DROP FUNCTION IF EXISTS public.rialto_cloture_service(uuid,int,boolean);
-- Aucune compensation : la fonction n'écrit qu'un statut terminal légitime.
-- Les commandes déjà closes RESTENT closes (c'est l'état voulu) ; il n'y a
-- rien à défaire. Le code TS tolère l'absence de la fonction (il journalise
-- et continue), donc l'ordre code/DDL est indifférent.
-- ============================================================================
