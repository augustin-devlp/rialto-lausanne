-- ============================================================
-- B3a — Découverte + extraction du catalogue Jet Pizza legacy
-- STATUT : NON EXÉCUTÉE — et NON EXÉCUTABLE aujourd'hui
-- Cible  : ANCIEN projet Supabase curduiiydfpwiwbimypu — LECTURE SEULE STRICTE
-- ============================================================
-- ÉTAT au 2026-05-01 : le projet curduiiydfpwiwbimypu est INACTIVE
-- (en pause). Connexion testée 2 fois → "Connection terminated due to
-- connection timeout". Pour exécuter ce script :
--   1. Augustin restaure le projet (dashboard Supabase → projet
--      curduiiydfpwiwbimypu → Restore, ~2 min, gratuit)
--   2. Exécuter la PHASE 1 (découverte) ci-dessous
--   3. Si catalogue trouvé → exécuter la PHASE 2 (extraction)
--   4. Re-mettre le projet en pause
-- AUCUN UPDATE/INSERT/DELETE ne doit être exécuté sur cette base.
-- ============================================================

-- ─────────────────────────────────────────────
-- PHASE 1 — DÉCOUVERTE : un catalogue Jet Pizza existe-t-il ?
-- ─────────────────────────────────────────────

-- 1.1 Tous les restaurants de l'ancienne base (la recherche historique
--     filtrait sur %rialto% — celle-ci est exhaustive)
SELECT id, name, slug, business_id, created_at
FROM restaurants
ORDER BY created_at;

-- 1.2 Nombre de plats par restaurant
SELECT r.slug, r.name, count(mi.id) AS n_items
FROM restaurants r
LEFT JOIN menu_items mi ON mi.restaurant_id = r.id
GROUP BY r.id, r.slug, r.name
ORDER BY n_items DESC;

-- 1.3 Recherche "jet" dans les entités Stampify (businesses = les
--     commerces clients de l'ère Stampify, si la table existe)
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'businesses';

-- Si la table businesses existe :
-- SELECT id, name FROM businesses WHERE name ILIKE '%jet%';

SELECT id, name, slug FROM restaurants WHERE name ILIKE '%jet%' OR slug ILIKE '%jet%';
SELECT DISTINCT c.name FROM menu_categories c ORDER BY c.name;

-- INTERPRÉTATION :
--  - Si 1.1 ne montre qu'un restaurant (Rialto, 121 items) → PAS de
--    catalogue Jet Pizza legacy. STOP ici, Augustin fournit le menu
--    (remplir B3b à la main).
--  - Si un restaurant/business Jet apparaît → noter son id et passer
--    en PHASE 2 avec cet id.

-- ─────────────────────────────────────────────
-- PHASE 2 — EXTRACTION : génère les INSERT pour la base ACTIVE
-- Remplacer <LEGACY_JET_ID> par l'id trouvé en phase 1,
-- et <NEW_JET_ID> par l'id retourné par B1 sur la base active.
-- ─────────────────────────────────────────────

-- 2.1 Génère les INSERT des catégories
SELECT format(
  'INSERT INTO public.menu_categories (restaurant_id, name, display_order, icon) VALUES (%L, %L, %s, %L);',
  '<NEW_JET_ID>', name, display_order, icon
) AS insert_stmt
FROM menu_categories
WHERE restaurant_id = '<LEGACY_JET_ID>'
ORDER BY display_order;

-- 2.2 Génère les INSERT des plats (colonnes de base ; les colonnes
--     upsell/taxonomie pourront être re-seedées plus tard).
--     NOTE : category_id doit être re-mappé sur les NOUVEAUX ids de
--     catégories — l'extraction sort le NOM de la catégorie en
--     commentaire pour permettre le mapping via un CTE à l'import :
SELECT format(
  'INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, is_available, is_vegetarian, is_spicy, has_options, display_order) '
  || 'SELECT %L, c.id, %L, %L, %s, %L, %L, %L, %L, %s FROM public.menu_categories c WHERE c.restaurant_id = %L AND c.name = %L;',
  '<NEW_JET_ID>', mi.name, mi.description, mi.price, mi.is_available,
  mi.is_vegetarian, mi.is_spicy, mi.has_options, mi.display_order,
  '<NEW_JET_ID>', mc.name
) AS insert_stmt
FROM menu_items mi
JOIN menu_categories mc ON mc.id = mi.category_id
WHERE mi.restaurant_id = '<LEGACY_JET_ID>'
ORDER BY mc.display_order, mi.display_order;

-- 2.3 Génère les INSERT des options (re-mapping item par nom —
--     suppose les noms de plats uniques au sein de l'enseigne) :
SELECT format(
  'INSERT INTO public.menu_item_options (item_id, option_group, option_name, extra_price, is_required, max_selections, display_order) '
  || 'SELECT i.id, %L, %L, %s, %L, %s, %s FROM public.menu_items i WHERE i.restaurant_id = %L AND i.name = %L;',
  o.option_group, o.option_name, o.extra_price, o.is_required,
  o.max_selections, o.display_order, '<NEW_JET_ID>', mi.name
) AS insert_stmt
FROM menu_item_options o
JOIN menu_items mi ON mi.id = o.item_id
WHERE mi.restaurant_id = '<LEGACY_JET_ID>'
ORDER BY mi.name, o.display_order;

-- Les insert_stmt produits sont à coller dans B3b (qui devient alors
-- le seed définitif, à exécuter sur la base ACTIVE ymnhfdkyqbhucxdrnyzq).
