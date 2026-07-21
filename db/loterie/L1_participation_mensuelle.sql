-- ============================================================================
-- L1 — Participation loterie MENSUELLE (design 3, décision Augustin 21.07.2026)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE vers la review caisse.
-- Contexte : « 1 commande dans le mois = 1 participation au tirage du mois ».
-- La table est VIDE (0 ligne vérifiée le 21.07) — aucun backfill nécessaire.
-- ============================================================================

-- 1. Colonne mois : date du 1er du mois, calendrier Europe/Zurich.
--    DEFAULT côté DB = filet de sécurité pour tout écriveur qui ne la
--    fournirait pas (l'app la passe toujours explicitement via
--    zurichMonthStart()).
ALTER TABLE public.lottery_participants
  ADD COLUMN month date NOT NULL
  DEFAULT (date_trunc('month', (now() AT TIME ZONE 'Europe/Zurich'))::date);

-- 2. Garde-fou : month est TOUJOURS un 1er du mois (même convention que
--    lottery_draws.month, amendement navette D2).
ALTER TABLE public.lottery_participants
  ADD CONSTRAINT lottery_participants_month_first_day
  CHECK (month = date_trunc('month', month)::date);

-- 3. Unicité MENSUELLE : une participation par (loterie, téléphone, mois).
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
-- - Site : les écriveurs (POST /api/orders nouveau maillon, lottery/enter)
--   passent month explicitement et TOLÈRENT l'absence de la colonne
--   (PGRST204/42703 → log + repli) — code déployé AVANT cette migration.
-- - Lecteurs (tirage D2, compteurs dashboard) : filtrent sur le mois
--   courant après exécution ; repli tolérant avant.
-- - RLS : inchangée (lottery_participants = deny-all Lot 1, service_role).
-- ROLLBACK :
--   ALTER TABLE public.lottery_participants
--     DROP CONSTRAINT lottery_participants_lottery_phone_month_key,
--     DROP CONSTRAINT lottery_participants_month_first_day,
--     DROP COLUMN month;
--   ALTER TABLE public.lottery_participants
--     ADD CONSTRAINT lottery_participants_lottery_id_phone_key
--     UNIQUE (lottery_id, phone);
-- ============================================================================
