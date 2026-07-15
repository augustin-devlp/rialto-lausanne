-- ============================================================
-- B3b — Seed du menu Jet Pizza (TEMPLATE)
-- STATUT : NON EXÉCUTÉE — template à remplir
-- Cible  : projet Supabase ymnhfdkyqbhucxdrnyzq (base active)
-- ============================================================
-- DEUX FAÇONS DE REMPLIR CE FICHIER :
--   a) Coller les insert_stmt générés par B3a (si le catalogue legacy
--      existe dans l'ancienne base)
--   b) Transcrire le menu fourni par Augustin (PDF / photo / texte)
--      en suivant le pattern ci-dessous
--
-- DÉPENDANCE : B1 exécutée. Remplacer <NEW_JET_ID> par l'id retourné
-- par B1 (ou utiliser le sous-select par slug, comme ci-dessous).
-- ============================================================

-- Pattern recommandé : tout par slug, aucun uuid en dur.

-- ── 1. Catégories (exemple, adapter au vrai menu) ──────────
INSERT INTO public.menu_categories (restaurant_id, name, display_order)
SELECT r.id, v.name, v.display_order
FROM public.restaurants r,
     (VALUES
        ('Pizzas',    1),
        ('Menus',     2),
        ('Boissons',  3)
        -- TODO : compléter avec les vraies catégories Jet Pizza
     ) AS v(name, display_order)
WHERE r.slug = 'jet-pizza'
ON CONFLICT DO NOTHING;

-- ── 2. Plats (exemple de pattern, 1 INSERT par plat) ────────
-- Colonnes minimales requises : restaurant_id, category_id, name, price.
-- description/flags optionnels. has_options=true si le plat a des
-- options (taille, suppléments) à insérer en 3.
INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, has_options, display_order)
SELECT r.id, c.id, v.name, v.description, v.price, v.has_options, v.display_order
FROM public.restaurants r
JOIN public.menu_categories c ON c.restaurant_id = r.id AND c.name = 'Pizzas'
CROSS JOIN (VALUES
    -- ('Margherita', 'Tomate, mozzarella, basilic', 14.50, false, 1),
    -- ('Pepperoni',  'Tomate, mozzarella, pepperoni', 17.00, true, 2)
    ('<TODO_PLAT>', '<TODO_DESCRIPTION>', 0.00, false, 1)
) AS v(name, description, price, has_options, display_order)
WHERE r.slug = 'jet-pizza'
ON CONFLICT DO NOTHING;

-- ── 3. Options (si has_options=true) ────────────────────────
INSERT INTO public.menu_item_options (item_id, option_group, option_name, extra_price, is_required, max_selections, display_order)
SELECT i.id, v.option_group, v.option_name, v.extra_price, v.is_required, v.max_selections, v.display_order
FROM public.menu_items i
JOIN public.restaurants r ON r.id = i.restaurant_id AND r.slug = 'jet-pizza'
CROSS JOIN (VALUES
    -- ('Taille', 'Moyenne 30cm', 0.00,  true, 1, 1),
    -- ('Taille', 'Grande 40cm',  5.00,  true, 1, 2)
    ('<TODO_GROUPE>', '<TODO_OPTION>', 0.00, false, 1, 1)
) AS v(option_group, option_name, extra_price, is_required, max_selections, display_order)
WHERE i.name = '<TODO_PLAT>';

-- ── Vérification post-exécution ─────────────────────────────
-- SELECT c.name AS categorie, count(i.id) AS n_plats
-- FROM public.menu_categories c
-- LEFT JOIN public.menu_items i ON i.category_id = c.id
-- WHERE c.restaurant_id = (SELECT id FROM public.restaurants WHERE slug='jet-pizza')
-- GROUP BY c.name ORDER BY c.name;

-- ── Rollback complet du seed ────────────────────────────────
-- DELETE FROM public.menu_items      WHERE restaurant_id = (SELECT id FROM public.restaurants WHERE slug='jet-pizza');
-- DELETE FROM public.menu_categories WHERE restaurant_id = (SELECT id FROM public.restaurants WHERE slug='jet-pizza');
-- (menu_item_options suit via FK, sinon DELETE explicite d'abord)
