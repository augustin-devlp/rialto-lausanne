-- ============================================================================
-- LOT 1 — Durcissement RLS tables clients (engagement contractuel art. 8)
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- Rédigée et EXÉCUTÉE le 2026-05-01 (GO Augustin : « exécution dès que prêt »)
--
-- FONDEMENT : audit exhaustif + contre-audit adversarial du repo
-- rialto-lausanne (2026-05-01) — 100 % des accès aux tables ci-dessous
-- passent par supabaseService() (service_role, fail-fast sans fallback anon
-- depuis le commit backlog 1bis-d). Le cas critique /c/[shortCode] (carte
-- fidélité publique) passe par lookupCardByShortCode() en service_role.
-- 4 tables (rialto_customers, reservations, customer_tags, gift_cards) ne
-- sont référencées NULLE PART dans le code du site.
-- La caisse (repo servato-caisse) ne touche que orders / order_items /
-- order_status_history / caisse_access — hors périmètre de ce lot.
--
-- CE QUI RESTE APRÈS CE LOT (volontairement conservé) :
--   - policies owner-scoped saines : merchants_read_tags / merchants_write_tags
--     (customer_tags), merchants_read_own_sms_logs (sms_logs),
--     "owner can manage gift cards" (gift_cards)
--   - INSERT publics sur orders / order_items (tunnel de commande — backlog 1bis-a)
--   - SELECT publics sur restaurants / menu_* / delivery_zones / lotteries /
--     spin_wheels / promotions / loyalty_cards / sms_templates / vip_tiers
--     (à auditer dans un lot ultérieur si souhaité)
-- ============================================================================

-- customers : noms, téléphones, emails, dates de naissance — plus de public.
DROP POLICY "Accès public lecture customers" ON public.customers;
DROP POLICY "Accès public insertion customers" ON public.customers;

-- customer_cards : QR, short_code, tampons — plus de public.
DROP POLICY "Accès public lecture customer_cards" ON public.customer_cards;
DROP POLICY "Accès public insertion customer_cards" ON public.customer_cards;

-- rialto_customers : était SELECT + INSERT + UPDATE public (la pire).
DROP POLICY "Public read rialto_customers" ON public.rialto_customers;
DROP POLICY "Public insert rialto_customers" ON public.rialto_customers;
DROP POLICY "Public update rialto_customers" ON public.rialto_customers;

-- reservations : lecture publique des réservations (PII) + update par tout
-- compte authentifié + insert public — aucune n'est utilisée par le site.
DROP POLICY "Anyone can read reservations for slot checking" ON public.reservations;
DROP POLICY "Anyone can create a reservation" ON public.reservations;
DROP POLICY "Authenticated users can update reservations" ON public.reservations;

-- Policies « service_role » factices : déclarées pour {public} avec
-- qual=true → elles ouvraient TOUT à tous. Le vrai service_role bypasse la
-- RLS de toute façon : suppression sèche, aucune recréation nécessaire.
DROP POLICY "service_role_all_sms_logs" ON public.sms_logs;
DROP POLICY "service_role_all_tags" ON public.customer_tags;

-- gift_cards : lecture publique de TOUTES les cartes cadeaux (codes inclus).
DROP POLICY "public can read gift card by code" ON public.gift_cards;

-- ============================================================================
-- ROLLBACK (recréation à l'identique si besoin) :
--   CREATE POLICY "Accès public lecture customers" ON public.customers FOR SELECT USING (true);
--   CREATE POLICY "Accès public insertion customers" ON public.customers FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Accès public lecture customer_cards" ON public.customer_cards FOR SELECT USING (true);
--   CREATE POLICY "Accès public insertion customer_cards" ON public.customer_cards FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Public read rialto_customers" ON public.rialto_customers FOR SELECT USING (true);
--   CREATE POLICY "Public insert rialto_customers" ON public.rialto_customers FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Public update rialto_customers" ON public.rialto_customers FOR UPDATE USING (true);
--   CREATE POLICY "Anyone can read reservations for slot checking" ON public.reservations FOR SELECT USING (true);
--   CREATE POLICY "Anyone can create a reservation" ON public.reservations FOR INSERT WITH CHECK (true);
--   CREATE POLICY "Authenticated users can update reservations" ON public.reservations FOR UPDATE TO authenticated USING (true);
--   CREATE POLICY "service_role_all_sms_logs" ON public.sms_logs FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "service_role_all_tags" ON public.customer_tags FOR ALL USING (true) WITH CHECK (true);
--   CREATE POLICY "public can read gift card by code" ON public.gift_cards FOR SELECT USING (true);
-- ============================================================================
