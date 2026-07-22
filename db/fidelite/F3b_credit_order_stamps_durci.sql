-- ============================================================================
-- F3b — credit_order_stamps DURCI : les 2 réserves de la navette F0
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE vers la review caisse.
--
-- Rappel des réserves émises lors de la review F0 (à corriger AVANT
-- l'activation du killswitch, cf. F5) :
--   1. TOCTOU crédit-après-annulation — le FOR UPDATE ne portait que sur
--      customer_cards ; la relecture de orders.status était un SELECT non
--      verrouillé. Si la caisse annulait dans la fenêtre, le tampon était
--      crédité quand même.
--   2. Aucun contrôle d'appariement carte↔commande — l'index unique porte
--      sur order_id SEUL, donc un mauvais appariement créditait
--      définitivement la mauvaise carte, et le retry avec la bonne était
--      absorbé silencieusement en {ok:true, already:true}. Échec silencieux :
--      exactement l'anti-pattern combattu partout dans ce projet.
--
-- CE QUI CHANGE (rien d'autre) :
--   a) SELECT ... FROM orders ... FOR SHARE  → le statut ne peut plus changer
--      sous nos pieds jusqu'au COMMIT. Verrou partagé de quelques
--      millisecondes ; il ne bloque pas les lectures, et n'entre jamais en
--      compétition avec le scan comptoir (credit_stamp ne touche pas orders).
--   b) ORDRE DE VERROUILLAGE ÉTABLI : orders PUIS customer_cards, partout.
--      Aucun chemin existant ne prend les verrous dans l'ordre inverse
--      (credit_stamp ne verrouille que customer_cards et ne lit jamais
--      orders), donc aucun cycle possible → pas d'interblocage.
--   c) CONTRÔLE D'APPARIEMENT avant toute écriture : la carte doit appartenir
--      au client de la commande, sinon ok:false EXPLICITE ('appariement_
--      invalide'), jamais un succès silencieux et jamais de ligne insérée.
--   d) orders.customer_id NULL → ok:false 'commande_sans_client' (une telle
--      commande ne peut appartenir à personne, donc ne peut rien créditer).
-- ============================================================================

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
  v_card_id       uuid;
  v_card_customer uuid;
  v_current       int;
  v_program       uuid;
  v_required      int;
  v_status        text;
  v_order_customer uuid;
  v_enabled       boolean;
  v_new_total     int;
  v_inserted      int;
begin
  if p_stamps is null or p_stamps <= 0 then
    return jsonb_build_object('ok', true, 'credited', 0, 'reason', 'zero');
  end if;

  -- (1) VERROU SUR LA COMMANDE D'ABORD (ordre établi : orders → customer_cards).
  --     FOR SHARE fige le statut jusqu'au COMMIT : la caisse ne peut plus
  --     annuler entre notre lecture et notre écriture (réserve navette n°1).
  select o.status, o.customer_id
    into v_status, v_order_customer
  from orders o
  where o.id = p_order_id
  for share;

  if v_status is null then
    return jsonb_build_object('ok', false, 'error', 'commande_introuvable');
  end if;
  -- ⚠️ MIROIR de SOLID_STATUSES (src/lib/loyalty/settle.ts) : toute
  --    évolution du vocabulaire OrderStatus doit être répercutée des 2 côtés.
  if v_status not in ('accepted','preparing','ready','completed') then
    return jsonb_build_object('ok', true, 'credited', 0, 'reason', 'not_settled');
  end if;
  if v_order_customer is null then
    return jsonb_build_object('ok', false, 'error', 'commande_sans_client');
  end if;

  -- (2) VERROU SUR LA CARTE ENSUITE.
  select cc.id, cc.customer_id, coalesce(cc.current_stamps, 0), cc.card_id
    into v_card_id, v_card_customer, v_current, v_program
  from customer_cards cc
  where cc.id = p_customer_card_id
  for update;

  if v_card_id is null then
    return jsonb_build_object('ok', false, 'error', 'Carte introuvable');
  end if;

  -- (3) APPARIEMENT CARTE ↔ COMMANDE, AVANT toute écriture (réserve n°2).
  --     Un mismatch ne doit JAMAIS créditer, ni poser la ligne qui
  --     empêcherait ensuite le crédit légitime.
  if v_card_customer is distinct from v_order_customer then
    return jsonb_build_object(
      'ok', false,
      'error', 'appariement_invalide',
      'detail', 'la carte n''appartient pas au client de la commande'
    );
  end if;

  -- (3bis) KILLSWITCH EN DÉFENSE DE PROFONDEUR. Les 3 chemins TypeScript le
  --        contrôlent déjà, mais le dernier rempart avant l'écriture ne doit
  --        pas dépendre de l'appelant : c'est l'unique raison d'être du flag.
  select coalesce(lc.stamps_required, 10), coalesce(lc.stamp_online_enabled, false)
    into v_required, v_enabled
  from loyalty_cards lc where lc.id = v_program;
  v_required := coalesce(v_required, 10);

  if not coalesce(v_enabled, false) then
    return jsonb_build_object('ok', false, 'error', 'killswitch_off');
  end if;

  -- (4) L'INSERT EST LE PORTIER : idempotence garantie par l'index unique
  --     partiel transactions(order_id) WHERE type='stamp_added' (F0/M2).
  insert into transactions (customer_card_id, order_id, type, value, source)
  values (p_customer_card_id, p_order_id, 'stamp_added', p_stamps, p_source)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    return jsonb_build_object('ok', true, 'credited', 0, 'already', true);
  end if;

  -- (5) Incrément PLAFONNÉ. Jamais de reset, jamais de rewards_claimed+1 :
  --     le flux en ligne ne CONSOMME JAMAIS une récompense (2e verrou de la
  --     règle anti « donné-repris »). La consommation reste un geste comptoir.
  v_new_total := least(v_current + p_stamps, v_required);

  update customer_cards
  set current_stamps = v_new_total
  where id = p_customer_card_id;

  -- 'credited' = ce qui a RÉELLEMENT été écrit, pas ce qui a été demandé :
  -- quand le plafond de la carte absorbe une partie du crédit, le rapport et
  -- les compteurs des appelants doivent dire la vérité (sinon le pilotage
  -- sur-compte et masque le surplus perdu).
  return jsonb_build_object(
    'ok', true,
    'credited', v_new_total - v_current,
    'requested', p_stamps,
    'new_stamps', v_new_total,
    'stamps_required', v_required
  );
end;
$function$;

-- ACL inchangée (CREATE OR REPLACE la préserve) ; rappelée ici par sécurité.
REVOKE ALL ON FUNCTION public.credit_order_stamps(uuid, uuid, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_order_stamps(uuid, uuid, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.credit_order_stamps(uuid, uuid, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.credit_order_stamps(uuid, uuid, integer, text) TO service_role;

-- ============================================================================
-- IMPACTS
-- - CAISSE : aucune ligne de code à changer. Nouveauté à connaître : pendant
--   les quelques millisecondes où ce RPC s'exécute, un UPDATE du statut de
--   CETTE commande précise attend le relâchement du FOR SHARE. Le RPC ne fait
--   aucun I/O externe et se termine en ms ; aucun autre chemin ne prend ces
--   verrous en sens inverse, donc pas d'interblocage possible.
--   PRÉCISION (relevé de relecture) : deux solidifications concurrentes sur
--   deux commandes du MÊME client sérialisent sur le FOR UPDATE de
--   customer_cards ; l'UPDATE caisse de la 2e commande peut donc attendre
--   TRANSITIVEMENT la 1re. Toujours de l'ordre de la milliseconde, et sans
--   cycle (donc sans interblocage), mais l'attente n'est pas strictement
--   limitée à « la commande concernée ».
-- - APPELANTS : nouveaux codes d'erreur explicites (commande_introuvable,
--   commande_sans_client, appariement_invalide). src/lib/loyalty/settle.ts et
--   le cron les journalisent déjà et ne les confondent PAS avec un succès.
-- - Aucune table, colonne, contrainte, RLS ou publication modifiée.
-- ROLLBACK : re-CREATE OR REPLACE de la version F0/M4 (archivée dans
--   db/fidelite/F0_fidelite_v2.sql, section M4).
-- ============================================================================
