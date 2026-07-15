-- ============================================================
-- B2 — Accès caisse à l'enseigne Jet Pizza
-- STATUT : NON EXÉCUTÉE
-- Cible  : projet Supabase ymnhfdkyqbhucxdrnyzq (base active)
-- ============================================================
-- DÉPENDANCES (les 3 sont bloquantes) :
--   1. B1_create_restaurant.sql exécutée (la ligne jet-pizza existe)
--   2. La table public.caisse_access créée par les migrations du repo
--      servato-caisse (supabase/migrations/). Le schéma ci-dessous
--      suppose les colonnes (user_id, restaurant_id, role) avec
--      UNIQUE(user_id, restaurant_id) — À ALIGNER sur le schéma final
--      du repo servato-caisse avant exécution si les noms diffèrent.
--   3. uid du user caisse-rialto@servato.ch (créé par Augustin au
--      dashboard Supabase → Auth → Users), à substituer ci-dessous.
-- ============================================================

INSERT INTO public.caisse_access (user_id, restaurant_id, role)
SELECT
  '<TODO_UID_CAISSE_RIALTO>'::uuid,
  r.id,
  'caisse'
FROM public.restaurants r
WHERE r.slug = 'jet-pizza'
ON CONFLICT (user_id, restaurant_id) DO NOTHING;

-- Vérification post-exécution :
--   SELECT ca.role, r.slug FROM public.caisse_access ca
--   JOIN public.restaurants r ON r.id = ca.restaurant_id
--   WHERE ca.user_id = '<TODO_UID_CAISSE_RIALTO>';
--   → doit montrer 2 lignes : rialto + jet-pizza
--   (la ligne rialto étant seedée par les migrations servato-caisse)

-- ROLLBACK :
--   DELETE FROM public.caisse_access
--   WHERE user_id = '<TODO_UID_CAISSE_RIALTO>'
--     AND restaurant_id = (SELECT id FROM public.restaurants WHERE slug = 'jet-pizza');
