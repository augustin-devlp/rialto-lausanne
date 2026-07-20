-- ============================================================================
-- D5a — UNIQUE sur push_subscriptions.endpoint
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : EXÉCUTÉE le 20.07.2026 — INCIDENT : exécutée en double par les
--          deux conversations (course DDL sans dégât), état final = index
--          unique brut, régularisé en contrainte par D5a2 (versionnée).
--          Voir D5a2_promote_endpoint_constraint.sql.
-- ============================================================================

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

-- ============================================================================
-- EXPLICATION (pour la review) :
--
-- ADD CONSTRAINT UNIQUE(endpoint) → répare un BUG LATENT ACTIF : le POST
--   /api/push/subscribe du site fait un upsert onConflict('endpoint')
--   (subscribe/route.ts:72-88) or PostgREST refuse un ON CONFLICT sans
--   contrainte unique correspondante ("no unique or exclusion constraint
--   matching the ON CONFLICT specification"). L'opt-in push du site est
--   donc cassé aujourd'hui — invisible car 0 abonné (vérifié :
--   count(*)=0, seule contrainte existante = la PK).
--   Un endpoint push est par nature unique (URL du navigateur) : la
--   contrainte est sémantiquement correcte ET débloque l'upsert.
--   0 ligne en base → aucun risque de doublon préexistant.
--
-- Impact caisse : zéro (la caisse ne touche pas push_subscriptions).
-- Impact site : positif uniquement (le subscribe se met à fonctionner).
-- RLS : inchangée (table sans policy = deny-all anon/auth, service_role only).
--
-- ROLLBACK : ALTER TABLE public.push_subscriptions
--            DROP CONSTRAINT push_subscriptions_endpoint_key;
-- ============================================================================
