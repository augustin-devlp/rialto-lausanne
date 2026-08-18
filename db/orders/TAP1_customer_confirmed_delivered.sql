-- ============================================================================
-- TAP1 — Vérité terrain : tap client « votre commande est arrivée ? »
-- Chantier recalibrage ETA (GO Augustin 18.08.2026, correction 3 : v1
-- avant le gel du 25.08 — condition du recalibrage de septembre).
-- STATUT : EN NAVETTE (review caisse) — NE PAS EXÉCUTER avant le retour
--          « GO D'EXÉCUTION ». Exécution via apply_migration par la
--          conversation propriétaire du repo rialto-lausanne UNIQUEMENT.
-- ============================================================================
--
-- CE QUE FAIT CE SQL, EXACTEMENT :
--   1. Ajoute UNE colonne nullable `customer_confirmed_delivered_at` à
--      `orders` : l'horodatage du tap client sur la page de suivi
--      (« Commande arrivée ? » dès la phase En livraison ; « Bien
--      récupérée ? » en retrait). C'est LA première vérité terrain du
--      système — aucune des 37 tables n'horodate aujourd'hui la remise
--      réelle (audit V5 du 17.08) ; sans elle, aucun recalibrage du
--      moteur ETA ne sera jamais possible.
--   2. AUCUN autre changement : pas de statut, pas de trigger, pas
--      d'index (lectures par id, la colonne est un attribut passif).
--      Le site n'écrit JAMAIS orders.status — invariant conservé : le
--      tap écrit UNIQUEMENT cette colonne, la phase affichée reste
--      dérivée (3e intrant forward-only de derivePhase, côté code).
--
-- BIAIS DOCUMENTÉS (à garder en tête au recalibrage) :
--   - l'échantillon des clients qui tapent n'est pas aléatoire, et un
--     tap tardif majore la durée réelle — calibrer sur les
--     distributions, pas les moyennes ;
--   - EXCLURE les commandes cancelled : un tap peut précéder un refus
--     caisse (le timestamp reste, la garde TOCTOU de la route ne couvre
--     que l'annulation simultanée) ;
--   - le serveur borne l'ÂGE (5 min - 6 h) mais PAS la phase (assumé,
--     review caisse 18.08) : filtrer au recalibrage les taps
--     implausibles (antérieurs à accepted_at + cuisine estimée).
--
-- ✅ EXÉCUTÉE le 18.08.2026 (GO caisse) — post-vérifiée : colonne
-- timestamptz nullable + COMMENT en place. Ce fichier reste le document
-- de référence du recalibrage.
--
-- IMPACT CAISSE ATTENDU : AUCUN. La caisse ne lit ni n'écrit cette
-- colonne ; un SELECT * côté caisse verra une colonne nullable de plus,
-- inerte. Aucun trigger, aucun changement de statut, aucune RLS
-- modifiée. Le seul écrivain est POST /api/orders/[id]/confirm-delivered
-- (service role, idempotent).
--
-- VERROUS / COÛT : ALTER TABLE ... ADD COLUMN nullable SANS DEFAULT =
-- métadonnée seule (pas de réécriture de table), verrou ACCESS EXCLUSIVE
-- BREF sur orders — borné par le lock_timeout obligatoire (invariant
-- CLAUDE.md depuis TR1b : sans lui, un ALTER en file derrière un verrou
-- long gèle la caisse).
--
-- REJOUABLE : oui — IF NOT EXISTS.
--
-- ROLLBACK (inline) :
--   SET lock_timeout = '5s';
--   ALTER TABLE orders DROP COLUMN IF EXISTS customer_confirmed_delivered_at;
-- ============================================================================

SET lock_timeout = '5s';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_confirmed_delivered_at timestamptz;

COMMENT ON COLUMN orders.customer_confirmed_delivered_at IS
  'Tap client « commande arrivée ? » (page de suivi, TAP1 18.08.2026). Vérité terrain du recalibrage ETA + clôture logique de la commande + déclencheur naturel du CTA avis. Écrit UNIQUEMENT par POST /api/orders/[id]/confirm-delivered (idempotent, premier tap gagnant). Ne remplace PAS orders.status (que le site n''écrit jamais).';
