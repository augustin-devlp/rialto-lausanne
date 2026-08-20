-- ═══════════════════════════════════════════════════════════════════════
-- NAVETTE PR1 — Lot « re-dérivation des prix serveur » (BLOQUANT go-live,
-- GO Augustin 20.08.2026). Deux volets INDISSOCIABLES :
--   1. orders.pricing_adjustments — le journal des écarts client/serveur
--      exigé par la décision « prix serveur sans bloquer + journaliser » ;
--   2. HY2 order_items — durcissement grants + policy : SANS lui, la
--      re-dérivation applicative est CONTOURNABLE par INSERT direct
--      PostgREST avec la clé anon publique du bundle (policy « Public
--      insert order_items » WITH CHECK true + grants par défaut jamais
--      resserrés, TRUNCATE compris). Miroir exact de HY1b (orders).
--
-- Base : ymnhfdkyqbhucxdrnyzq. Exécution : conversation propriétaire du
-- repo UNIQUEMENT, via apply_migration, APRÈS retour de navette caisse.
--
-- ── QUESTIONS À LA CAISSE (réponse attendue avec le GO) ────────────────
-- Q1. Le bloc 2 REMPLACE la policy publique d'INSERT order_items par une
--     policy scopée caisse_access (même prédicat que votre lecture
--     caisse_read_order_items) : authenticated ne peut plus insérer des
--     lignes QUE sur les commandes de SON restaurant. Si les commandes
--     comptoir sont au programme, ce scope vous suffit-il ? Si vous
--     renoncez à INSERT order_items, dites-le : nous révoquons aussi le
--     grant authenticated et la policy (variante commentée en fin de
--     bloc 2) — resserrage maximal.
-- Q2. Intégrité des MONTANTS des commandes comptoir : la re-dérivation
--     serveur du site ne couvre PAS vos INSERT directs (total_amount,
--     subtotal par ligne = libres au niveau base, aucun CHECK). Votre
--     code en répond seul. Souhaitez-vous une contrainte base commune
--     (trigger de recalcul ou CHECK de cohérence subtotal =
--     (item_price_snapshot + Σ extra_price) × quantity) en navette
--     ultérieure ? (Hors périmètre PR1 — on ne fige rien sans vous.)
-- ═══════════════════════════════════════════════════════════════════════

-- ── BLOC 1 : journal des écarts de prix ────────────────────────────────
-- Touche orders → garde lock_timeout OBLIGATOIRE (amendement TR1b).
SET lock_timeout = '5s';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pricing_adjustments jsonb;

COMMENT ON COLUMN public.orders.pricing_adjustments IS
  'Journal des écarts prix client/serveur (lot re-dérivation 20.08.2026). '
  'NULL = aucun écart (cas normal). Sinon : { total_client, total_serveur, '
  'lignes: [{ menu_item_id, nom, quantity, subtotal_client, '
  'subtotal_serveur, motif: "prix" | "option_inconnue" }] }. Écrit par '
  'POST /api/orders en UPDATE best-effort APRÈS l''INSERT (pattern '
  'attribution) : le code fonctionne AVANT cette migration, le journal '
  'est simplement muet. Tolérance ±0.01 (floats client). Un écart à la '
  'HAUSSE > 0.01 ne crée JAMAIS de commande (409 re-confirmation, '
  'décision Augustin 20.08 : le prix affiché engage) — cette colonne ne '
  'porte donc que les baisses et les options inconnues.';

-- ── BLOC 2 : HY2 order_items (miroir HY1b) ─────────────────────────────
-- État constaté 20.08 : anon et authenticated = ALL (grants par défaut,
-- DELETE/TRUNCATE/TRIGGER/REFERENCES/UPDATE compris) + policy INSERT
-- publique WITH CHECK (true). anon n'a AUCUN besoin sur order_items (le
-- site lit et écrit en service_role) ; authenticated (caisse) a besoin
-- de SELECT (tickets) et — sous réserve Q1 — d'INSERT scopé.

REVOKE ALL ON TABLE public.order_items FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON TABLE public.order_items FROM authenticated;
-- PG17 : MAINTAIN n'est pas couvert par la liste ci-dessus.
REVOKE MAINTAIN ON TABLE public.order_items FROM authenticated;

-- La policy publique (WITH CHECK true → n'importe quelle ligne sur
-- n'importe quel order_id, clé anon comprise tant que le grant vivait)
-- devient une policy CAISSE : même prédicat que caisse_read_order_items.
DROP POLICY IF EXISTS "Public insert order_items" ON public.order_items;
CREATE POLICY caisse_insert_order_items ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.caisse_access ca ON ca.restaurant_id = o.restaurant_id
      WHERE o.id = order_items.order_id
        AND ca.user_id = (SELECT auth.uid())
    )
  );

-- Variante si la caisse RENONCE à INSERT order_items (réponse Q1) :
--   REVOKE INSERT ON TABLE public.order_items FROM authenticated;
--   DROP POLICY IF EXISTS caisse_insert_order_items ON public.order_items;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLLBACK (dans l'ordre inverse ; lock_timeout aussi — règle TR1b)
-- ═══════════════════════════════════════════════════════════════════════
-- SET lock_timeout = '5s';
-- DROP POLICY IF EXISTS caisse_insert_order_items ON public.order_items;
-- CREATE POLICY "Public insert order_items" ON public.order_items
--   FOR INSERT TO public WITH CHECK (true);
-- GRANT ALL ON TABLE public.order_items TO anon;
-- GRANT ALL ON TABLE public.order_items TO authenticated;
-- ALTER TABLE public.orders DROP COLUMN IF EXISTS pricing_adjustments;
-- NOTE rollback : re-granter ALL restaure l'état d'AVANT (troué) — ne
-- rollback le bloc 2 que si la caisse est réellement bloquée, et
-- préférer alors la variante minimale (GRANT INSERT seul).
