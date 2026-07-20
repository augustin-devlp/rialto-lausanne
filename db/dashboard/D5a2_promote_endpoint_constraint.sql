-- ============================================================================
-- D5a2 — Régularisation D5a : promotion index brut → contrainte UNIQUE
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : EXÉCUTÉE le 21.07.2026 en migration VERSIONNÉE
--          (20260720220507_d5a2_promote_push_endpoint_unique_constraint).
-- ============================================================================

ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_endpoint_key
  UNIQUE USING INDEX push_subscriptions_endpoint_key;

-- ============================================================================
-- CONTEXTE (incident du 20.07.2026) :
--
-- D5a a été exécutée EN DOUBLE par les deux conversations (course DDL,
-- collision d'index, sans dégât). L'état final laissé en base était un
-- CREATE UNIQUE INDEX brut — fonctionnellement équivalent pour l'upsert
-- PostgREST, mais PAS la contrainte de l'artefact reviewé (D5a spécifiait
-- ADD CONSTRAINT). Cette migration régularise, à la demande du reviewer
-- caisse.
--
-- UNIQUE USING INDEX → absorbe l'index existant comme support de la
--   contrainte : non destructif, aucun rebuild, le nom est conservé.
--
-- Post-vérification live (21.07.2026) :
--   pg_constraint : push_subscriptions_endpoint_key UNIQUE (endpoint) ✓
--   index toujours présent (support de la contrainte) ✓
--
-- RÈGLE ACTÉE suite à l'incident : l'exécution d'une migration appartient
-- à UNE seule conversation — la propriétaire du repo (rialto-lausanne =
-- cette conversation) ; l'autre reviewe et post-vérifie. Et plus aucun
-- SQL brut hors historique de migrations : tout passe versionné
-- (apply_migration).
--
-- ROLLBACK : ALTER TABLE public.push_subscriptions
--            DROP CONSTRAINT push_subscriptions_endpoint_key;
--            (recrée l'état index-seul ? NON — DROP CONSTRAINT supprime
--            aussi l'index support ; rollback complet = re-exécuter D5a.)
-- ============================================================================
