-- ============================================================================
-- CL0 — RÉPARATION : 37 REFUS ÉCRASÉS EN « TERMINÉES » LE 20.08
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en attente du GO d'Augustin (21.08.2026).
--   ⚠️ Mettre ce statut à jour LE JOUR de l'exécution (piège F3b).
--
-- ⚠️ À EXÉCUTER **AVANT** CL1 ET **AVANT** F7. Ordre imposé, voir §ORDRE.
--
-- ────────────────────────────────────────────────────────────────────────
-- CE QUI S'EST PASSÉ
-- ────────────────────────────────────────────────────────────────────────
-- Le 20.08.2026 entre 22:09:10 et 22:26:17 UTC, 52 commandes sont passées
-- en `completed` pour vider l'écran de la caisse. Mesuré sur
-- order_status_history :
--
--     accepted  → completed :  15 commandes,  1 054.00 CHF   ← voulu
--     cancelled → completed :  37 commandes,  2 175.50 CHF   ← DÉGÂT
--
-- 37 commandes REFUSÉES ont été marquées « terminées ». Le geste était
-- « je balaie l'écran », pas « je clos les acceptées » — et l'écran
-- affichait AUSSI les refusées (STATUTS_AFFICHES inclut `cancelled`
-- pendant 24 h côté caisse).
--
-- ────────────────────────────────────────────────────────────────────────
-- POURQUOI C'EST À RÉPARER (et pas seulement cosmétique)
-- ────────────────────────────────────────────────────────────────────────
-- 1. CHIFFRE D'AFFAIRES FAUSSÉ. src/app/api/dashboard/summary/route.ts
--    calcule `revenue` en excluant le SEUL statut `cancelled`. Ces
--    2 175.50 CHF de commandes jamais servies sont donc comptés comme du
--    chiffre d'affaires. C'est le premier chiffre que lit le restaurateur.
-- 2. LA PREUVE DE L'EXPLOIT FIDÉLITÉ A ÉTÉ EFFACÉE. Les 4 lignes
--    `stamp_added` qui justifient la navette F7 portaient un order_id
--    `cancelled` ; leurs commandes sont maintenant `completed`, donc
--    SOLIDES. La requête « tampons sur commande annulée » renvoie 0.
-- 3. ⚠️ SI F7 ÉTAIT EXÉCUTÉE EN L'ÉTAT, elle considérerait ces 4 tampons
--    comme parfaitement légitimes (statut solide = état dû « crédité »)
--    et ne les retirerait jamais. Le dégât se pérenniserait.
-- 4. Ces commandes ne sont plus identifiables par `cancellation_reason` :
--    seules 22 des 37 en portent un.
--
-- ────────────────────────────────────────────────────────────────────────
-- CE QUI SAUVE TOUT : order_status_history est intact
-- ────────────────────────────────────────────────────────────────────────
-- Chaque commande porte son parcours complet. Le prédicat « il existe une
-- transition cancelled → completed » identifie les 37 SANS AMBIGUÏTÉ, et
-- ne peut pas produire de faux positif : aucune commande légitimement
-- terminée n'est jamais passée par `cancelled`.
--
-- ⚠️ SI CE PRÉDICAT DEVAIT UN JOUR SERVIR À NOUVEAU, le vérifier d'abord :
-- une ré-acceptation légitime (cancelled → accepted → … → completed)
-- produirait, elle, une transition cancelled → **accepted**, pas
-- cancelled → completed. Le prédicat ci-dessous exige la transition
-- DIRECTE, donc il reste exact. Au 21.08 il renvoie exactement 37 lignes.
-- ============================================================================
SET lock_timeout = '5s';

-- ── ÉTAPE 1 — INVENTAIRE (à exécuter et à LIRE avant toute écriture) ────
-- Attendu : 37 lignes, somme 2 175.50 CHF.
SELECT o.order_number, o.status, o.total_amount, o.cancellation_reason,
       (SELECT h.changed_at FROM order_status_history h
         WHERE h.order_id = o.id AND h.old_status='cancelled'
           AND h.new_status='completed'
         ORDER BY h.changed_at DESC LIMIT 1) AS ecrase_le
  FROM orders o
 WHERE o.restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
   AND o.status = 'completed'
   AND EXISTS (SELECT 1 FROM order_status_history h
                WHERE h.order_id = o.id
                  AND h.old_status = 'cancelled'
                  AND h.new_status = 'completed')
 ORDER BY o.order_number;

-- ── ÉTAPE 2 — RESTAURATION ──────────────────────────────────────────────
-- ⚠️ Le trigger trg_orders_status_history écrira une ligne par commande :
-- la réparation elle-même sera tracée (completed → cancelled), signée
-- « cron-reparation ». C'est voulu : on ne réécrit PAS l'histoire, on
-- ajoute un chapitre.
-- ⚠️ ORDRE : cette étape doit précéder l'exécution de F7. Sinon le trigger
-- F7 (une fois posé) verrait completed → cancelled comme une bascule de
-- solidité et RETIRERAIT les tampons — ce qui est le comportement voulu à
-- terme, mais qui doit être une décision explicite, pas un effet de bord
-- de la réparation. Voir §ORDRE.
--
-- BEGIN;
--   SELECT set_config('request.jwt.claims',
--     (coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
--       || jsonb_build_object('email', 'cron-reparation'))::text, true);
--
--   UPDATE orders o
--      SET status = 'cancelled'
--    WHERE o.restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
--      AND o.status = 'completed'
--      AND EXISTS (SELECT 1 FROM order_status_history h
--                   WHERE h.order_id = o.id
--                     AND h.old_status = 'cancelled'
--                     AND h.new_status = 'completed');
--   -- ATTENDU : UPDATE 37
--
--   -- Contrôle immédiat, DANS la transaction :
--   SELECT status, count(*), sum(total_amount) FROM orders
--    WHERE restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
--    GROUP BY status;
--   -- ATTENDU : cancelled 37 / 2 175.50 · completed 15 / 1 054.00
-- COMMIT;   -- (ou ROLLBACK si les chiffres divergent)

-- ── ÉTAPE 3 — CONTRÔLES APRÈS COMMIT ────────────────────────────────────
-- a) Le CA du dashboard retombe à 1 054.00 CHF (summary exclut cancelled).
-- b) Les 4 tampons fantômes redeviennent détectables :
--      SELECT t.value, o.order_number FROM transactions t
--        JOIN orders o ON o.id = t.order_id
--       WHERE t.type='stamp_added' AND o.status='cancelled';
--      ATTENDU : 4 lignes, 5 tampons (R-2026-042, 043, 045, 051).
-- c) transactions et customer_cards INCHANGÉES par cette étape
--    (aucun trigger fidélité n'existe encore — F7 n'est pas exécutée).
-- d) sms_logs INCHANGÉ (aucune notification ne part d'un UPDATE de statut).
-- e) L'écran caisse : les 37 refusées ont plus de 24 h, elles ne
--    réapparaîtront donc PAS (fenêtre `cancelled` de 24 h côté caisse).
--    ⚠️ À re-vérifier au moment de l'exécution si le délai a changé.

-- ============================================================================
-- §ORDRE D'EXÉCUTION DES TROIS NAVETTES — IMPOSÉ
-- ============================================================================
--   1. CL0 (ce fichier)  — restaurer les 37 refus.
--   2. Décision d'Augustin sur les 5 tampons fantômes redevenus visibles :
--      les laisser (décision « pas de rétroactif » du 20.08 → ils seront
--      purgés au grand ménage), ou les reprendre à la main. NE PAS
--      exécuter F7 en espérant qu'elle s'en charge : F7 ne retire un
--      tampon qu'au MOMENT d'une transition, elle ne balaie pas
--      l'existant. Le filet cron, lui, le ferait — d'où la question.
--   3. F7 — retrait des tampons sur renversement (avec le trigger amendé
--      qui ignore les transitions sans bascule de solidité).
--   4. CL1 — clôture du service précédent (liste positive : ne peut plus
--      jamais toucher une commande `cancelled`).
--
-- Faire CL1 avant CL0 re-mélangerait les deux populations. Faire F7 avant
-- CL0 ferait retirer les tampons par effet de bord de la réparation.
-- ============================================================================
