-- ============================================================
-- B1 — Jet Pizza : ligne restaurants dédiée
-- STATUT : NON EXÉCUTÉE
-- Cible  : projet Supabase ymnhfdkyqbhucxdrnyzq (base active)
-- ============================================================
-- ARBITRAGE 2026-05-01 : business_id reste NULL.
-- Il est réservé au futur compte propriétaire (Mehmet). L'accès de la
-- caisse passe par la table caisse_access (repo servato-caisse), PAS
-- par business_id.
--
-- accepting_orders = false jusqu'au lancement du site jetpizza.ch :
-- le POST /api/orders de rialto-lausanne refuse toute commande d'un
-- restaurant qui n'accepte pas (check "accepting_orders" ligne ~75 de
-- src/app/api/orders/route.ts). Ça permet de seeder le menu sans
-- risquer une commande réelle avant le go-live.
-- ============================================================

INSERT INTO public.restaurants (
  slug,
  name,
  business_id,
  address,
  phone,
  order_min_amount,
  order_open_time,
  order_close_time,
  prep_time_minutes,
  accepting_orders,
  offers_pickup,
  offers_delivery,
  delivery_prep_time_minutes,
  pickup_prep_time_minutes,
  receipt_email
) VALUES (
  'jet-pizza',
  'Jet Pizza',
  NULL,                                -- volontaire — voir arbitrage ci-dessus
  '<TODO_ADRESSE_JET_PIZZA>',          -- TODO Augustin (même cuisine que Rialto ? même adresse ?)
  '<TODO_TELEPHONE_JET_PIZZA>',        -- TODO Augustin, format +41...
  25,                                  -- TODO Augustin : minimum de commande CHF
  '11:00:00',                          -- TODO Augustin : heure d'ouverture commandes
  '22:30:00',                          -- TODO Augustin : heure de fermeture commandes
  25,
  false,                               -- NE PAS passer à true avant le go-live jetpizza.ch
  true,
  true,
  30,
  15,
  'augustindomenget@servato.ch'
)
ON CONFLICT (slug) DO NOTHING
RETURNING id;

-- ⚠️ NOTER l'id retourné : il est requis par B2 (caisse_access) et B3 (seed menu).
-- Vérification post-exécution :
--   SELECT id, slug, name, accepting_orders FROM public.restaurants ORDER BY created_at;
--   → doit montrer 2 lignes : rialto + jet-pizza (accepting_orders=false pour jet-pizza)

-- ROLLBACK (si besoin, AVANT tout seed de menu/commandes — sinon cascade !) :
--   DELETE FROM public.restaurants WHERE slug = 'jet-pizza';
--   ⚠️ FK ON DELETE CASCADE sur orders : ce DELETE supprimerait aussi
--   toutes les commandes Jet Pizza. À ne faire que sur un restaurant vide.
