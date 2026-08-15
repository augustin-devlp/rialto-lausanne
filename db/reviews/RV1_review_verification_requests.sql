-- ============================================================================
-- RV1 — Gate avis roue : table des requêtes de vérification d'avis Google
-- Chantier « gate avis ON, vérification API officielle » (Augustin 14.08.2026).
-- STATUT : EN NAVETTE (review caisse) — NE PAS EXÉCUTER avant le retour
--          « GO D'EXÉCUTION ». Exécution via apply_migration par la
--          conversation propriétaire du repo rialto-lausanne UNIQUEMENT.
-- ============================================================================
--
-- CE QUE FAIT CE SQL, EXACTEMENT :
--   1. Crée la table `review_verification_requests` : la déclaration d'un
--      client (« mon nom Google est X ») en attente de matching contre les
--      avis réels de la fiche (Business Profile API). AUCUNE table
--      existante n'est modifiée — google_review_claims reste la source du
--      déblocage roue. La contrainte UNIQUE des claims (business_id,
--      review_author_name, review_time) a été VÉRIFIÉE en base le
--      14.08.2026 (pg_constraint) : « 1 avis = 1 roue max » est garanti
--      pour les claims API.
--   2. Statuts : 'pending' (déclaré, pas encore matché), 'verified'
--      (matché par l'API → claim créé), 'manual_pending' (le client a
--      cliqué « mon avis n'apparaît pas »), 'manual_approved' (validé au
--      dashboard → claim créé), 'expired' (fenêtre de re-check épuisée).
--   3. Index sur (customer_id, created_at DESC) pour le settle-on-read,
--      et sur (status) partiel pour la liste dashboard.
--   4. AUCUN trigger, AUCUNE RLS ajoutée (table servie exclusivement par
--      les routes serveur via service role — pattern des tables loyalty).
--
-- VERROUS / COÛT : CREATE TABLE avec FK prend un SHARE ROW EXCLUSIVE
-- BREF sur chaque table référencée (customers, google_review_claims) —
-- les écritures y sont bloquées le temps de la commande, borné par le
-- lock_timeout. (Corrigé en relecture : « aucun verrou » était faux.)
--
-- REJOUABLE : oui — IF NOT EXISTS partout.
--
-- ROLLBACK (inline) :
--   DROP TABLE IF EXISTS review_verification_requests;
-- ============================================================================

SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS review_verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  business_id uuid NOT NULL,
  -- Nom Google déclaré par le client, tel que saisi (le matching
  -- normalise casse/accents côté code, on garde l'original).
  google_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','manual_pending','manual_approved','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  check_count integer NOT NULL DEFAULT 0,
  -- ANTI-VOL D'AVIS (relecture 14.08) : les reviewId DÉJÀ publics au
  -- moment de la déclaration — jamais matchables. Sans ce snapshot, un
  -- tiers pouvait déclarer le nom (public) d'un avis fraîchement paru
  -- dans la fenêtre de tolérance et voler le tour. NULL si le provider
  -- était injoignable au moment du POST (le matching applique alors une
  -- tolérance amont réduite).
  seen_review_ids text[],
  -- Renseignés au match : l'horodatage de l'avis apparié (aussi écrit
  -- dans le claim) et le claim créé.
  matched_review_time timestamptz,
  claim_id uuid REFERENCES google_review_claims(id)
);

CREATE INDEX IF NOT EXISTS idx_review_requests_customer
  ON review_verification_requests (customer_id, created_at DESC);
-- Dashboard : la file trie par date, le filtre statut est optionnel.
CREATE INDEX IF NOT EXISTS idx_review_requests_dashboard
  ON review_verification_requests (status, created_at DESC);
-- UNE requête vivante par client (deux POST simultanés = 23505, traité
-- côté route en renvoyant l'existante).
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_requests_active
  ON review_verification_requests (customer_id)
  WHERE status IN ('pending','manual_pending');

COMMENT ON TABLE review_verification_requests IS
  'Gate avis roue (RV1) : déclarations « mon nom Google est X » en attente de matching API Business Profile. Le déblocage reste porté par google_review_claims. Modes : declarative (actif) / api / mock — cf. docs/REVIEW_GATE.md.';
