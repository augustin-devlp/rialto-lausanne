-- ============================================================================
-- TR1 — Attribution marketing des commandes : colonne orders.attribution
-- Chantier tracking Lot F (UTM), séquencement validé par Augustin 24.07.2026.
-- STATUT : EN NAVETTE (review caisse) — NE PAS EXÉCUTER avant le retour
--          « GO D'EXÉCUTION ». Exécution via apply_migration par la
--          conversation propriétaire du repo rialto-lausanne UNIQUEMENT.
-- ============================================================================
--
-- CE QUE FAIT CE SQL, EXACTEMENT :
--   1. Ajoute UNE colonne à `orders` :
--        attribution jsonb NULL (pas de défaut, pas de backfill)
--      NULL = « on ne sait pas d'où venait cette visite » (toutes les
--      commandes existantes, et toute commande future sans UTM capté).
--   2. Pose un COMMENT descriptif sur la colonne (documentation schéma).
--   3. Ne modifie AUCUNE donnée, aucune autre table, aucun index (volume
--      Rialto : les requêtes de reporting sur jsonb se font sans index).
--
-- FORME DU JSON (écrit par POST /api/orders, best-effort, clés en liste
-- blanche, valeurs tronquées à 200 caractères côté serveur) :
--   { "utm_source": "...", "utm_medium": "...", "utm_campaign": "...",
--     "utm_term": "...", "utm_content": "...",
--     "referrer": "hôte externe de provenance", "landing": "/chemin",
--     "captured_at": "ISO-8601" }
--   Toutes les clés optionnelles. Modèle LAST-TOUCH non-direct : la
--   dernière visite porteuse d'UTM (ou de referrer externe) dans les
--   30 jours gagne, persistée côté client (localStorage versionné).
--
-- ÉCRITURE TOLÉRANTE : le code applicatif écrit l'attribution par un
-- UPDATE séparé APRÈS l'INSERT de la commande, en avalant l'erreur
-- « colonne inconnue » (pattern lottery month) — le code peut donc être
-- déployé AVANT cette migration sans casser la création de commande ;
-- l'attribution commence à se remplir dès l'exécution de TR1.
--
-- VERROUS / COÛT : ADD COLUMN nullable sans défaut = metadata-only,
-- verrou ACCESS EXCLUSIVE bref. Négligeable.
--
-- REJOUABLE : oui — ADD COLUMN IF NOT EXISTS ; COMMENT ON est idempotent.
--
-- ROLLBACK (inline) :
--   ALTER TABLE orders DROP COLUMN IF EXISTS attribution;
--
-- IMPACT CAISSE ATTENDU : nul — colonne nullable jamais NOT NULL, la
-- caisse ne projette pas `attribution` (à confirmer en review, comme
-- pour LS0).
-- ============================================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS attribution jsonb;

COMMENT ON COLUMN orders.attribution IS
  'Attribution marketing last-touch (UTM + referrer + landing + captured_at), écrite best-effort au POST. NULL = provenance inconnue. Lot F tracking, TR1.';
