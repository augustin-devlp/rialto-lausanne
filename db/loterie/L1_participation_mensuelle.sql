-- ============================================================================
-- L1 — Participation loterie MENSUELLE (design 3, décision Augustin 21.07.2026)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : GO navette caisse (21.07) avec amendement backfill intégré.
-- Contexte : « 1 commande dans le mois = 1 participation au tirage du mois ».
-- La table contient 1 LIGNE (créée le 21.07 par le nouveau maillon
-- POST /api/orders, via le repli pré-migration) — d'où le backfill explicite.
-- ============================================================================

-- 1. Colonne mois : date du 1er du mois, calendrier Europe/Zurich.
--    DEFAULT côté DB = filet de sécurité pour tout écriveur qui ne la
--    fournirait pas (l'app la passe toujours explicitement via
--    zurichMonthStart()).
ALTER TABLE public.lottery_participants
  ADD COLUMN month date NOT NULL
  DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Europe/Zurich'))::date);

-- 2. BACKFILL (amendement navette caisse 21.07) : recalcule month depuis
--    created_at pour les lignes pré-migration — le DEFAULT poserait le
--    mois d'EXÉCUTION, pas le mois réel de la commande. Rend la migration
--    juste quel que soit son jour d'exécution.
UPDATE public.lottery_participants
SET month = date_trunc('month', (created_at AT TIME ZONE 'Europe/Zurich'))::date;

-- 3. Garde-fou : month est TOUJOURS un 1er du mois (même convention que
--    lottery_draws.month, amendement navette D2).
ALTER TABLE public.lottery_participants
  ADD CONSTRAINT lottery_participants_month_first_day
  CHECK (month = date_trunc('month', month)::date);

-- 4. Unicité MENSUELLE : une participation par (loterie, téléphone, mois).
--    Remplace l'unicité historique par téléphone (= une participation à
--    vie), incompatible avec le tirage mensuel du design 3.
ALTER TABLE public.lottery_participants
  DROP CONSTRAINT IF EXISTS lottery_participants_lottery_id_phone_key;
ALTER TABLE public.lottery_participants
  ADD CONSTRAINT lottery_participants_lottery_phone_month_key
  UNIQUE (lottery_id, phone, month);

-- ============================================================================
-- IMPACTS (pour la review) :
-- - Caisse : zéro (la caisse ne touche pas aux tables loterie).
-- - Site : les écriveurs (POST /api/orders, lottery/enter) passent month
--   explicitement et tolèrent son absence (repli PGRST204/42703) — code
--   déployé AVANT cette migration.
-- - Lecteurs (tirage D2, compteurs dashboard, already_entered, état A) :
--   filtrent sur le mois après exécution ; replis tolérants avant.
-- - RLS : inchangée par cette migration. Précision (correction d'annonce) :
--   lottery_participants porte la policy héritée owner_all_lottery_participants
--   (ALL, qual business_id = auth.uid()) — INERTE car lotteries.business_id
--   est NULL et aucun client authentifié n'existe ; les accès réels passent
--   par service_role. Pas de policy publique.
-- ROLLBACK :
--   ALTER TABLE public.lottery_participants
--     DROP CONSTRAINT lottery_participants_lottery_phone_month_key,
--     DROP CONSTRAINT lottery_participants_month_first_day,
--     DROP COLUMN month;
--   ALTER TABLE public.lottery_participants
--     ADD CONSTRAINT lottery_participants_lottery_id_phone_key
--     UNIQUE (lottery_id, phone);
-- ============================================================================
