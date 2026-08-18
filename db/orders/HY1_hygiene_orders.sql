-- ============================================================================
-- HY1 — Hygiène orders (privilèges, purge click IDs, COMMENT) + seed SMS
-- Lot G clôture (GO Augustin 25.08.2026 − 6 jours), demande initiale caisse.
-- STATUT : EN NAVETTE (review caisse) — NE PAS EXÉCUTER avant le retour
--          « GO D'EXÉCUTION ». Exécution via apply_migration par la
--          conversation propriétaire du repo rialto-lausanne UNIQUEMENT.
-- ============================================================================
--
-- CE QUE FAIT CE SQL, EXACTEMENT (4 blocs indépendants) :
--
-- BLOC 1 — REVOKE sur orders (la demande caisse d'origine + son ajout) :
--   État CONSTATÉ en base le 19.08.2026 (information_schema + relacl,
--   preuve à l'appui) : anon ET authenticated détiennent DELETE,
--   TRUNCATE, TRIGGER, REFERENCES, INSERT, SELECT sur orders — l'héritage
--   des GRANT par défaut Supabase — PLUS le privilège MAINTAIN (« m »
--   dans pg_class.relacl, PG17 : VACUUM/ANALYZE/CLUSTER/REINDEX et
--   surtout LOCK TABLE — invisible dans information_schema, relevé par
--   la relecture 19.08). TRUNCATE ÉCHAPPE À LA RLS (le point caisse) :
--   une clé anon compromise pouvait vider la table ; MAINTAIN est du même
--   modèle de menace : un LOCK TABLE orders IN ACCESS EXCLUSIVE MODE par
--   une session anon gèlerait TOUS les accès — la caisse bloquée.
--   authenticated détient en plus UPDATE ciblé (printed_at, status) —
--   le canal d'écriture de la caisse, PRÉSERVÉ tel quel.
--     REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN
--       → anon, authenticated
--       (REFERENCES ajouté au-delà de la demande DELETE/TRUNCATE/TRIGGER :
--        aucun rôle public ne crée de FK vers orders — à confirmer en
--        review, retirez-le du bloc si vous en voyez un usage)
--     REVOKE INSERT → anon SEULEMENT (le point relevé par la caisse :
--       anon détenait l'INSERT colonne sur printed_at/status — c'était
--       le reflet colonne du GRANT INSERT table-level, il tombe avec).
--       authenticated GARDE INSERT : si la caisse saisit un jour des
--       commandes comptoir par ce rôle, rien ne casse.
--   CÔTÉ SITE : vérifié le 19.08 — TOUTES les écritures orders passent
--   par les routes serveur en service_role (hors de portée d'un REVOKE
--   sur anon/authenticated) ; anon ne sert qu'aux SELECT (realtime du
--   suivi + SSR confirmation), non touchés.
--
-- BLOC 2 — COMMENT ON COLUMN restaurants.free_delivery_threshold :
--   la dette ZL1 (col_description NULL sur une colonne au SENS RECYCLÉ
--   — le piège business_id déjà payé une fois). Glissée ici sur ordre
--   d'Augustin (19.08) plutôt que d'attendre une DDL hypothétique.
--
-- BLOC 3 — Purge des click IDs publicitaires (gclid/fbclid/msclkid)
--   dans orders.attribution (jsonb, TR1b) au-delà de 24 mois :
--   donnée pseudonyme de régie sans valeur d'attribution passé ce délai.
--   REJOUABLE et NO-OP AUJOURD'HUI (vérifié : 2 lignes d'attribution en
--   base, toutes de 2026 — première échéance réelle mi-2028). Les clés
--   utm_*/referrer/landing sont CONSERVÉES (agrégats marketing).
--   POLITIQUE D'EXÉCUTION : pas de pg_cron sur l'instance (vérifié) —
--   rejeu MANUEL semestriel du bloc 3, inscrit au runbook GO_LIVE ;
--   l'automatisation (greffe au cron applicatif quotidien existant) est
--   au backlog v1.1, hors gel.
--
-- BLOC 4 — CHECK sms_templates.template_key élargi + seed
--   referral_claim_reward (constat d'exécution 19.08 : l'INSERT du seed
--   commandé par Augustin a été REJETÉ en 23514 par
--   sms_templates_template_key_check — la clé, pourtant ACTIVE dans le
--   code depuis le 22.07 via le fallback en dur de smsTemplates.ts,
--   n'a jamais été ajoutée à la contrainte). DROP + re-ADD du CHECK avec
--   la clé en 21e position (liste intégrale relevée en base le 19.08),
--   puis INSERT conditionnel du template (vouvoyé, SANS URL : le domaine
--   rialto-lausanne.ch du fallback historique appartient à Just Eat —
--   l'URL finale sera ajoutée au template à la bascule domaine).
--   Table sms_templates : hors orders, verrou catalogue bref.
--
-- QUESTIONS POSÉES À LA CAISSE :
--   Q1. Votre rôle d'accès est-il authenticated ? Insérez-vous (ou
--       prévoyez-vous d'insérer) des orders par ce rôle ? (Si oui : rien
--       ne casse, INSERT authenticated est préservé. Si vous êtes en
--       service_role : rien ne vous concerne dans ce fichier.)
--   Q2. GO sur le REVOKE REFERENCES (hors demande initiale) ?
--   Q3. Voyez-vous un usage caisse de DELETE/TRUNCATE/TRIGGER sur orders
--       qui contredirait le bloc 1 ?
--
-- VERROUS / COÛT : REVOKE et COMMENT = catalogue, instantanés. UPDATE
-- de purge : 0 ligne aujourd'hui. lock_timeout en tête (migration ET
-- rollback) par convention maison (TR1b).
--
-- REJOUABILITÉ, BLOC PAR BLOC (précisé après relecture 19.08) :
--   Blocs 1+2 : idempotents, rejouables sans condition.
--   Bloc 3 : rejouable et PRESCRIT en rejeu MANUEL SEMESTRIEL — le rejeu
--     semestriel ne concerne QUE ce bloc (jamais 1/2/4).
--   Bloc 4 : DROP IF EXISTS + INSERT conditionnel = rejouable AUJOURD'HUI,
--     MAIS ⚠️ si une navette ultérieure modifie le CHECK template_key
--     (22e clé…), NE PAS rejouer ce bloc : il restaurerait la liste du
--     19.08 et écraserait l'évolution. La liste ci-dessous est un
--     INSTANTANÉ, pas une référence vivante.
--
-- ROLLBACK (inline) :
--   SET lock_timeout = '5s';
--   GRANT DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON public.orders
--     TO anon, authenticated;
--   GRANT INSERT ON public.orders TO anon;
--   COMMENT ON COLUMN public.restaurants.free_delivery_threshold IS NULL;
--   -- Bloc 3 : purge IRRÉVERSIBLE par nature (clés jsonb supprimées) —
--   -- sans objet aujourd'hui (no-op vérifié, 0 ligne éligible).
--   -- Bloc 4 :
--   DELETE FROM sms_templates
--     WHERE restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
--     AND template_key = 'referral_claim_reward';
--   -- (puis restaurer l'ancien CHECK : même DROP/ADD que ci-dessous en
--   --  retirant 'referral_claim_reward' de la liste)
--
-- IMPACT CAISSE ATTENDU : AUCUN si Q1 confirme (UPDATE printed_at/status
-- authenticated intact, INSERT authenticated intact, SELECT intact).
-- ============================================================================

-- Garde caisse (convention TR1b) : jamais de file d'attente gelée
-- derrière un verrou long sur orders.
SET lock_timeout = '5s';

-- ─── BLOC 1 : privilèges ────────────────────────────────────────────────
REVOKE DELETE, TRUNCATE, TRIGGER, REFERENCES, MAINTAIN ON public.orders
  FROM anon, authenticated;
REVOKE INSERT ON public.orders FROM anon;

-- ─── BLOC 2 : documentation schéma (dette ZL1) ──────────────────────────
COMMENT ON COLUMN public.restaurants.free_delivery_threshold IS
  'OFFSET en CHF au-dessus du minimum de commande de chaque zone — '
  'RECYCLÉE le 18-19.08.2026 (ZL1), ex-seuil global absolu. Seuil de '
  'gratuité d''une zone = delivery_zones.min_order_amount + cette valeur '
  '(dérivation canonique : freeDeliveryThresholdForZone, src/lib/delivery/'
  'rule.ts). Ne JAMAIS lire comme un seuil absolu : un code qui la '
  'traiterait ainsi offrirait la livraison sur 100 % des commandes. '
  'Activation pilotée par free_delivery_enabled ; règle permanente : '
  'couper free_delivery_enabled AVANT tout rollback du code applicatif.';

-- ─── BLOC 3 : purge click IDs > 24 mois (rejouable, no-op aujourd'hui) ──
UPDATE public.orders
SET attribution = attribution - 'gclid' - 'fbclid' - 'msclkid'
WHERE attribution IS NOT NULL
  AND created_at < now() - interval '24 months'
  AND attribution ?| array['gclid', 'fbclid', 'msclkid'];

-- ─── BLOC 4 : CHECK template_key élargi + seed referral_claim_reward ────
ALTER TABLE public.sms_templates
  DROP CONSTRAINT IF EXISTS sms_templates_template_key_check;
ALTER TABLE public.sms_templates
  ADD CONSTRAINT sms_templates_template_key_check CHECK (template_key = ANY (ARRAY[
    'order_confirmation'::text, 'order_accepted'::text, 'order_preparing'::text,
    'order_ready'::text, 'order_cancelled'::text, 'wheel_prize_code'::text,
    'lottery_winner'::text, 'lottery_loser'::text, 'lottery_new'::text,
    'lottery_result_winner'::text, 'lottery_result_loser'::text,
    'lottery_ticket_received'::text, 'wheel_available_again'::text,
    'birthday_offer'::text, 'birthday_wish'::text, 'birthday_wish_vip'::text,
    'loyalty_card_created'::text, 'referral_success'::text,
    'vip_tier_unlocked'::text, 'reward_unlocked'::text,
    'referral_claim_reward'::text
  ]));

INSERT INTO public.sms_templates (restaurant_id, template_key, content, enabled)
SELECT '046d930d-a4cd-4a43-a11a-7f76bfe74b06', 'referral_claim_reward',
  -- Pas de tiret cadratin ni d'accent : un seul caractère hors GSM-7
  -- bascule tout le SMS en UCS-2 (70 car./segment au lieu de 160 → 3
  -- segments facturés par filleul, relecture 19.08).
  'Bienvenue chez Rialto {{customer_name}} ! Votre code de bienvenue : {{code}} - une Pizza Marguerite offerte sur votre prochaine commande, valable 60 jours.',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.sms_templates
  WHERE restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
    AND template_key = 'referral_claim_reward'
);
