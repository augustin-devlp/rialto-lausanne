-- ============================================================================
-- D4a — Colonne referrals.referee_promo_code (lien structurel code filleul)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : EXÉCUTÉE le 21.07.2026 (GO navette caisse, aucune réserve) en
--          migration VERSIONNÉE 20260720221345_d4a_referrals_referee_promo_code.
--          Post-vérifié live : colonne text nullable sans default,
--          referrals toujours deny-all (0 policy).
-- ============================================================================

ALTER TABLE public.referrals
  ADD COLUMN referee_promo_code text;

-- ============================================================================
-- EXPLICATION (pour la review) :
--
-- ADD COLUMN referee_promo_code → aujourd'hui referrals.reward_promo_code
--   ne stocke QUE le code du parrain (MARG{id}P) ; le code du filleul
--   (MARG{id}F) n'est référencé dans AUCUNE colonne — la vue dashboard
--   « utilisé des deux côtés » devait le reconstruire par convention de
--   nommage (fragile). Cette colonne matérialise le lien.
--   Nullable, sans default, sans contrainte : purement additive.
--   Le cron reward-referrals l'écrit en best-effort (le code tolère son
--   absence : PGRST204 avalé avec log — déployé AVANT cette migration).
--   Le dashboard garde le fallback convention MARG{shortId}F pour les
--   referrals récompensés avant l'exécution de cette migration.
--
-- Impact caisse : zéro (la caisse ne touche pas referrals).
-- Impact site : zéro (colonne additive, aucun select * sur referrals).
-- RLS : inchangée (referrals sans policy = deny-all, service_role only).
--
-- ROLLBACK : ALTER TABLE public.referrals DROP COLUMN referee_promo_code;
-- ============================================================================
