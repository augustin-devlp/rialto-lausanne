-- ============================================================================
-- RV1b — Gate avis roue : table des requêtes de vérification d'avis Google
-- Révision de RV1 après retour de navette caisse (KO unanime, 15.08.2026).
-- STATUT : EN NAVETTE (re-review caisse) — NE PAS EXÉCUTER avant le retour
--          « GO D'EXÉCUTION ». Exécution via apply_migration par la
--          conversation propriétaire du repo rialto-lausanne UNIQUEMENT.
-- ============================================================================
--
-- CHANGEMENTS vs RV1 (verdict caisse) :
--   1. ENABLE ROW LEVEL SECURITY juste après le CREATE — LE BLOQUANT.
--      Pattern loyalty réel : RLS ACTIVÉE + ZÉRO policy (deny-all pour
--      anon/authenticated, service_role passe outre) — vérifié en base :
--      les 37 tables de public sont rls=true. Sans ce ENABLE, les
--      privilèges par défaut du schéma donnent TOUS les droits à
--      anon/authenticated sur toute table neuve : la clé publique aurait
--      pu lire la file entière (noms Google + customer_id), forger des
--      verified, vider le snapshot anti-vol, bloquer le gate d'un client
--      via l'index unique, ou DELETE la file.
--   2. CHECK de cohérence : verified/manual_approved ⇒ claim_id NOT NULL
--      (la route de re-déclaration est fail-open exactement sur cette
--      incohérence).
--   3. Statut 'rejected' ajouté au CHECK, HORS du prédicat de l'index
--      unique partiel — sans lui, un manual_pending refusé bloquerait le
--      client à vie. La route dashboard de refus viendra après ; le
--      statut doit exister dès maintenant.
--   4. claim_id : NO ACTION ASSUMÉ (comportement FK par défaut, aucune
--      clause). PAS de ON DELETE SET NULL — il violerait le CHECK du
--      point 2 au DELETE d'un claim. Un claim référencé ne doit pas
--      disparaître : les claims expirent par DATE (expires_at), jamais
--      par suppression.
--   5. SET lock_timeout = '5s' AUSSI dans le bloc rollback (le DROP
--      reprend des verrous sur customers et google_review_claims).
--   6. Index dashboard : (created_at DESC) simple — la requête réelle
--      liste « les 60 dernières » SANS filtre statut ; l'index
--      (status, created_at DESC) de RV1 ne la servait pas.
--   7. COMMENT sur business_id : uuid legacy Stampify, PAS une FK.
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
--      dashboard → claim créé), 'expired' (fenêtre de re-check épuisée,
--      OU avis supprimé constaté à la re-validation — gate remis à zéro),
--      'rejected' (refusé au dashboard — statut réservé, route à venir).
--   3. Active la RLS SANS policy (deny-all) : la table est servie
--      exclusivement par les routes serveur via service_role, comme les
--      autres tables loyalty.
--   4. Index : (customer_id, created_at DESC) pour le settle-on-read,
--      (created_at DESC) pour la liste dashboard, et l'index UNIQUE
--      partiel « une requête vivante par client ».
--   5. AUCUN trigger.
--
-- VERROUS / COÛT : CREATE TABLE avec FK prend un SHARE ROW EXCLUSIVE
-- BREF sur chaque table référencée (customers, google_review_claims) —
-- les écritures y sont bloquées le temps de la commande, borné par le
-- lock_timeout. Aucun accès à orders.
--
-- REJOUABLE : oui — IF NOT EXISTS partout ; ENABLE ROW LEVEL SECURITY
-- est idempotent.
--
-- ROLLBACK (inline) :
--   SET lock_timeout = '5s';
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
    CHECK (status IN ('pending','verified','manual_pending','manual_approved','expired','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_checked_at timestamptz,
  check_count integer NOT NULL DEFAULT 0,
  -- ANTI-VOL D'AVIS (relecture 14.08) : les reviewId DÉJÀ publics au
  -- moment de la déclaration — jamais matchables. Sans ce snapshot, un
  -- tiers pouvait déclarer le nom (public) d'un avis fraîchement paru
  -- dans la fenêtre de tolérance et voler le tour. NULL si le provider
  -- était injoignable au moment du POST (le matching applique alors une
  -- tolérance amont réduite, et le renouvellement automatique est refusé).
  seen_review_ids text[],
  -- Renseignés au match : l'horodatage de l'avis apparié (createTime
  -- Google original = ancrage PERMANENT des re-validations, jamais
  -- réécrit) et le claim créé.
  matched_review_time timestamptz,
  -- NO ACTION assumé (cf. en-tête point 4) : pas de SET NULL.
  claim_id uuid REFERENCES google_review_claims(id),
  -- Un statut débloquant sans claim serait un état corrompu — la route
  -- de re-déclaration est fail-open dessus (navette 15.08, point 2).
  CONSTRAINT chk_review_requests_claim_coherent
    CHECK (status NOT IN ('verified','manual_approved') OR claim_id IS NOT NULL)
);

-- LE BLOQUANT de la navette : pattern loyalty = RLS activée + ZÉRO policy
-- (deny-all ; service_role bypasse). Sans ce ENABLE, les privilèges par
-- défaut du schéma exposent la table entière à la clé publique.
ALTER TABLE review_verification_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_review_requests_customer
  ON review_verification_requests (customer_id, created_at DESC);
-- Dashboard : « les 60 dernières », sans filtre statut (navette, point 6).
CREATE INDEX IF NOT EXISTS idx_review_requests_dashboard
  ON review_verification_requests (created_at DESC);
-- UNE requête vivante par client (deux POST simultanés = 23505, traité
-- côté route en renvoyant l'existante). 'expired' et 'rejected' n'en
-- font pas partie : un refus ne bloque jamais une re-déclaration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_requests_active
  ON review_verification_requests (customer_id)
  WHERE status IN ('pending','manual_pending');

COMMENT ON TABLE review_verification_requests IS
  'Gate avis roue (RV1b) : déclarations « mon nom Google est X » en attente de matching API Business Profile. Le déblocage reste porté par google_review_claims. RLS activée sans policy (service role only). Modes : declarative (actif) / api / mock — cf. docs/REVIEW_GATE.md.';
COMMENT ON COLUMN review_verification_requests.business_id IS
  'uuid legacy Stampify (59b10af2-5dbc-4ddd-a659-c49f44804bff), PAS une FK vers restaurants.id — ne jamais « réparer » en ajoutant une FK (navette 15.08, point 7).';
