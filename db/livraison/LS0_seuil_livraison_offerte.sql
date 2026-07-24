-- ============================================================================
-- LS0 — Livraison offerte à partir d'un seuil : colonnes de réglage
-- Chantier LS (livraison offerte), plan validé par Augustin le 24.07.2026.
-- STATUT : EN NAVETTE (review caisse) — NE PAS EXÉCUTER avant le retour
--          « GO D'EXÉCUTION ». Exécution via apply_migration par la
--          conversation propriétaire du repo rialto-lausanne UNIQUEMENT.
-- ============================================================================
--
-- CE QUE FAIT CE SQL, EXACTEMENT :
--   1. Ajoute DEUX colonnes à `restaurants` (rien d'autre n'est touché) :
--        free_delivery_threshold  numeric(10,2) NOT NULL DEFAULT 50.00
--        free_delivery_enabled    boolean       NOT NULL DEFAULT false
--      La ligne existante (Rialto) reçoit les défauts : seuil 50.00,
--      DÉSACTIVÉ — aucun changement de comportement tant que Mehmet n'a
--      pas validé le montant et activé depuis le dashboard (LS1).
--   2. Pose un CHECK nommé `restaurants_free_delivery_threshold_positive`
--      (threshold > 0) : un seuil à 0 ou négatif avec le toggle activé
--      rendrait la livraison toujours gratuite par accident de saisie.
--   3. Ne modifie AUCUNE donnée, ne touche ni orders, ni delivery_zones,
--      ni loyalty_cards. Les frais par zone (delivery_zones.delivery_fee)
--      restent la référence tarifaire ; le seuil est une règle RESTAURANT.
--
-- VERROUS / COÛT : ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT est
-- metadata-only sur Postgres ≥ 11 (pas de réécriture de table) ; verrou
-- ACCESS EXCLUSIVE bref sur une table à 1 ligne. Négligeable.
--
-- REJOUABLE : oui — ADD COLUMN IF NOT EXISTS ; le CHECK est gardé par un
-- test d'existence dans pg_constraint (ADD CONSTRAINT IF NOT EXISTS
-- n'existe pas en Postgres).
--
-- ROLLBACK (inline, à exécuter en navette inverse si besoin) :
--   ALTER TABLE restaurants
--     DROP CONSTRAINT IF EXISTS restaurants_free_delivery_threshold_positive,
--     DROP COLUMN IF EXISTS free_delivery_threshold,
--     DROP COLUMN IF EXISTS free_delivery_enabled;
--
-- CONSOMMATEURS PRÉVUS (LS1/LS2, aucun encore branché au moment de LS0) :
--   - POST /api/orders : deliveryFee = 0 si enabled ET sous-total
--     marchandise AVANT remise promo ≥ threshold. ⚠️ Sémantique d'assiette
--     ACTÉE le 24.07.2026 : le SEUIL se calcule sur le COMMANDÉ (avant
--     remise — un code saisi ne doit jamais faire retomber le panier sous
--     le seuil sous les yeux du client) ; la FIDÉLITÉ se calcule sur le
--     PAYÉ (total_amount remisé). Séparation VOLONTAIRE, ne pas unifier.
--   - GET/PATCH /api/dashboard/delivery/rule (réglage, pattern fidélité).
--   - GET /api/rialto/delivery/rule (public, cache 60 s, pattern
--     loyalty/rule) pour l'affichage client + encouragement au palier.
-- ============================================================================

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS free_delivery_threshold numeric(10,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS free_delivery_enabled boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'restaurants_free_delivery_threshold_positive'
      AND conrelid = 'restaurants'::regclass
  ) THEN
    ALTER TABLE restaurants
      ADD CONSTRAINT restaurants_free_delivery_threshold_positive
      CHECK (free_delivery_threshold > 0);
  END IF;
END
$$;
