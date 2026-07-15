-- ============================================================
-- B2 — Accès caisse à l'enseigne Jet Pizza
-- STATUT : NON EXÉCUTÉE
-- Cible  : projet Supabase ymnhfdkyqbhucxdrnyzq (base active)
-- ============================================================
-- Aligné sur le schéma RÉEL de caisse_access défini par la migration
-- 001_fondations_caisse.sql du repo servato-caisse :
--   caisse_access(user_id uuid, restaurant_id uuid, created_at timestamptz,
--                 PRIMARY KEY (user_id, restaurant_id))
--   → PAS de colonne role. Gestion des lignes réservée au service_role.
--
-- DÉPENDANCES (les 2 sont bloquantes) :
--   1. B1_create_restaurant.sql exécutée (la ligne jet-pizza existe)
--   2. Migration 001 du repo servato-caisse exécutée (table caisse_access)
--
-- User caisse : caisse-rialto@servato.ch
-- UUID confirmé par Augustin : 4aa73cab-a7b1-44ba-9f89-baa1db60780d
-- ============================================================

INSERT INTO public.caisse_access (user_id, restaurant_id)
SELECT
  '4aa73cab-a7b1-44ba-9f89-baa1db60780d'::uuid,
  r.id
FROM public.restaurants r
WHERE r.slug = 'jet-pizza'
ON CONFLICT DO NOTHING;

-- Vérification post-exécution :
--   SELECT r.slug FROM public.caisse_access ca
--   JOIN public.restaurants r ON r.id = ca.restaurant_id
--   WHERE ca.user_id = '4aa73cab-a7b1-44ba-9f89-baa1db60780d';
--   → doit montrer 2 lignes : rialto (seedée par la 001) + jet-pizza

-- ROLLBACK :
--   DELETE FROM public.caisse_access
--   WHERE user_id = '4aa73cab-a7b1-44ba-9f89-baa1db60780d'
--     AND restaurant_id = (SELECT id FROM public.restaurants WHERE slug = 'jet-pizza');
