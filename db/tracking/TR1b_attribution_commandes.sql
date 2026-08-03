-- ============================================================================
-- TR1b — Attribution marketing des commandes : colonne orders.attribution
-- Chantier tracking Lot F (UTM), séquencement validé par Augustin 24.07.2026.
-- STATUT : GO NAVETTE 31.07.2026 avec UN amendement obligatoire (d'où le
--          « b ») : SET lock_timeout en tête de la migration ET du rollback.
--          Raison caisse : sans cette garde, un ALTER en file derrière un
--          verrou long gèle TOUS les accès à orders — blocage silencieux de
--          la caisse. RÉFLEXE OBLIGATOIRE pour toute migration future
--          touchant orders. Exécution via apply_migration par la
--          conversation propriétaire du repo, hors heures de service.
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
--     "gclid": "...", "fbclid": "...", "msclkid": "...",
--     "referrer": "hôte externe de provenance", "landing": "/chemin",
--     "captured_at": "ISO-8601 (format vérifié côté serveur)" }
--   Toutes les clés optionnelles. gclid/fbclid/msclkid = IDs de clic des
--   régies (l'auto-tagging Google Ads n'appose QUE gclid, pas d'utm_*).
--   Modèle LAST-TOUCH non-direct HIÉRARCHISÉ, 30 jours, persisté côté
--   client (localStorage versionné) : une visite CAMPAGNE (UTM/click id)
--   remplace la précédente ; une visite referrer-seul ne remplace JAMAIS
--   une campagne encore valide (sinon les canaux payants seraient
--   systématiquement sous-comptés) ; une visite directe ne touche rien.
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
--   SET lock_timeout = '5s';
--   ALTER TABLE orders DROP COLUMN IF EXISTS attribution;
--
-- IMPACT CAISSE ATTENDU : nul — colonne nullable jamais NOT NULL, la
-- caisse ne projette pas `attribution` (à confirmer en review, comme
-- pour LS0).
-- ============================================================================

-- Garde caisse (amendement navette 31.07.2026) : si un verrou long tient
-- orders, on ABANDONNE au bout de 5 s au lieu de faire la file en gelant
-- tous les accès derrière nous.
SET lock_timeout = '5s';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS attribution jsonb;

COMMENT ON COLUMN orders.attribution IS
  'Attribution marketing last-touch hiérarchisé (UTM + gclid/fbclid/msclkid + referrer + landing + captured_at), écrite best-effort au POST. NULL = provenance inconnue. Lot F tracking, TR1b.';
