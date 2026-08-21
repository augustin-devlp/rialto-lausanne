-- ============================================================================
-- NU1 — NUMÉROTATION DES COMMANDES SANS COURSE NI COLLISION
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : NON EXÉCUTÉE — en NAVETTE, attend le signal d'Augustin.
--   ⚠️ Mettre ce statut à jour LE JOUR de l'exécution (piège F3b).
--
-- ────────────────────────────────────────────────────────────────────────
-- CE QUE FAIT LA FONCTION AUJOURD'HUI
-- ────────────────────────────────────────────────────────────────────────
--   select count(*)+1 into v_count from public.orders
--    where restaurant_id = p_restaurant
--      and to_char(created_at,'YYYY') = v_year;
--   return coalesce(v_slug,'X') || '-' || v_year || '-' || lpad(v_count::text,3,'0');
--
-- Elle compte les lignes et ajoute un. Et `orders.order_number` porte un
-- index UNIQUE (`orders_order_number_key`, relevé en base le 22.08).
-- Un doublon n'est donc pas une gêne d'affichage : c'est une COMMANDE
-- REFUSÉE.
--
-- ════════════════════════════════════════════════════════════════════════
-- DÉFAUT 1 — LA COURSE. Deux commandes à la même seconde.
-- ════════════════════════════════════════════════════════════════════════
-- Les deux transactions lisent `count(*)` avant que l'autre n'ait inséré.
-- Les deux obtiennent le même rang, donc le même numéro. La première passe,
-- LA SECONDE EST REJETÉE par l'index unique.
--
-- Un vendredi à 19h30, deux clients qui valident dans la même seconde, ce
-- n'est pas un cas d'école. Et le client perdant ne voit pas « réessayez » :
-- il voit une erreur serveur sur une commande qu'il croyait passée.
--
-- ════════════════════════════════════════════════════════════════════════
-- 🔴 DÉFAUT 2 — CELUI QUI VA SE DÉCLENCHER AU GO-LIVE, ET IL EST PIRE
-- ════════════════════════════════════════════════════════════════════════
-- `count(*)` compte TOUTES les lignes de l'année, y compris celles qui ne
-- portent pas le format. Relevé en base le 22.08.2026 :
--
--     commandes 2026                     : 52
--     au format « R-2026-NNN »           : 33
--     au format « TEST-… »               : 19
--     plus grand rang réellement utilisé : 52
--
-- Aujourd'hui ça tient par accident : 52 lignes → prochain rang 53, libre.
--
-- ⚠️ LE JOUR OÙ LES 19 COMMANDES DE TEST SONT SUPPRIMÉES — c'est-à-dire le
-- jour du nettoyage avant le go-live, le geste le plus normal du monde —
-- `count(*)` tombe à 33. La fonction rend « R-2026-034 ».
-- CE NUMÉRO EXISTE DÉJÀ. L'index unique refuse. La commande est perdue.
-- Et ça recommence à la suivante, et à la suivante : environ DIX-NEUF
-- commandes refusées d'affilée, le soir du lancement, sans que rien dans
-- le code ne dise pourquoi.
--
-- La suppression d'UNE SEULE commande, pour n'importe quelle raison, suffit
-- à armer le même piège.
--
-- ════════════════════════════════════════════════════════════════════════
-- LA CORRECTION : UN COMPTEUR, PAS UN COMPTAGE
-- ════════════════════════════════════════════════════════════════════════
-- Un compteur ne redescend jamais quand on efface une ligne, et son
-- incrément est ATOMIQUE — la course disparaît par construction, pas par
-- une garde qu'il faudrait maintenir.
--
-- Table `order_counters (restaurant_id, annee, dernier)`. L'incrément se
-- fait par `INSERT … ON CONFLICT DO UPDATE … RETURNING` : une seule
-- instruction, donc un seul verrou de ligne, donc deux transactions
-- simultanées obtiennent deux rangs différents. Postgres sérialise, on ne
-- fait rien de plus.
--
-- ⚠️ POURQUOI PAS UNE `SEQUENCE` : il en faudrait une par restaurant ET par
-- année, créée dynamiquement en DDL depuis une fonction appelée en plein
-- service. Une table de compteurs fait le même travail sans DDL au runtime.
--
-- ⚠️ CE QUI NE CHANGE PAS : le FORMAT (`R-2026-053`), la signature de la
-- fonction, et son appelant. Le site n'a pas une ligne à modifier.
-- ⚠️ CE QUI NE CHANGE PAS NON PLUS : les numéros restent SÉQUENTIELS, donc
-- devinables. Ce n'est pas l'objet de cette navette — c'est le jeton d'accès
-- HMAC (`src/lib/orderAccess.ts`, livré le 21.08) qui répond à ça.
--
-- ============================================================================
-- MIGRATION
-- ============================================================================

-- ⚠️ Cette migration touche `orders` (elle remplace la fonction qui écrit
-- son `order_number`) : garde obligatoire, règle TR1b.
SET lock_timeout = '5s';

BEGIN;

CREATE TABLE IF NOT EXISTS public.order_counters (
  restaurant_id uuid    NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  annee         int     NOT NULL,
  dernier       int     NOT NULL DEFAULT 0,
  PRIMARY KEY (restaurant_id, annee)
);

COMMENT ON TABLE public.order_counters IS
  'Compteur de numérotation des commandes, par restaurant et par année '
  '(navette NU1, 22.08.2026). Remplace le count(*)+1 de '
  'generate_order_number, qui (1) créait une course entre deux commandes '
  'simultanées et (2) REDESCENDAIT quand une commande était supprimée — '
  'ce qui rejouait des numéros déjà pris et faisait refuser la commande '
  'par orders_order_number_key. Un compteur ne redescend jamais.';

-- 🔴 RLS : la table est fermée. Personne n'y accède en direct — seule la
-- fonction, qui est SECURITY DEFINER, l'écrit.
ALTER TABLE public.order_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_counters FROM anon, authenticated;

-- ── AMORÇAGE : on repart du plus grand rang RÉELLEMENT UTILISÉ ─────────
-- ⚠️ PAS de `count(*)` ici non plus : on prend le MAX du suffixe numérique
-- des numéros au bon format. C'est la seule valeur qui garantit qu'aucun
-- numéro déjà attribué ne sera rejoué. Les « TEST-… » sont ignorés : ils
-- n'ont pas de rang.
INSERT INTO public.order_counters (restaurant_id, annee, dernier)
SELECT o.restaurant_id,
       to_char(o.created_at, 'YYYY')::int,
       max((regexp_replace(o.order_number, '^[A-Z]-[0-9]{4}-', ''))::int)
FROM public.orders o
WHERE o.order_number ~ '^[A-Z]-[0-9]{4}-[0-9]+$'
GROUP BY o.restaurant_id, to_char(o.created_at, 'YYYY')::int
ON CONFLICT (restaurant_id, annee) DO UPDATE
  SET dernier = GREATEST(public.order_counters.dernier, EXCLUDED.dernier);

CREATE OR REPLACE FUNCTION public.generate_order_number(p_restaurant uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_slug  text;
  v_annee int := to_char(now(), 'YYYY')::int;
  v_rang  int;
begin
  select upper(left(slug, 1)) into v_slug
    from public.restaurants where id = p_restaurant;

  -- Incrément ATOMIQUE. Une seule instruction : deux transactions
  -- simultanées se sérialisent sur le verrou de la ligne et obtiennent
  -- deux rangs différents. C'est ce qui remplace le count(*)+1.
  insert into public.order_counters (restaurant_id, annee, dernier)
       values (p_restaurant, v_annee, 1)
  on conflict (restaurant_id, annee)
       do update set dernier = public.order_counters.dernier + 1
    returning dernier into v_rang;

  -- Format inchangé : lpad à 3, qui ne tronque pas au-delà de 999.
  return coalesce(v_slug, 'X') || '-' || v_annee::text || '-'
         || lpad(v_rang::text, 3, '0');
end;
$function$;

REVOKE ALL ON FUNCTION public.generate_order_number(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.generate_order_number(uuid) TO service_role;

-- ── CONTRÔLES, DANS LA MÊME TRANSACTION ───────────────────────────────
DO $$
DECLARE
  v_amorce int;
BEGIN
  SELECT dernier INTO v_amorce
    FROM public.order_counters
   WHERE restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
     AND annee = to_char(now(), 'YYYY')::int;

  IF v_amorce IS NULL THEN
    RAISE EXCEPTION 'NU1 : le compteur Rialto de l''année courante n''a pas été amorcé.';
  END IF;

  -- Le compteur ne doit JAMAIS être sous un rang déjà attribué.
  IF EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
       AND o.order_number ~ '^[A-Z]-[0-9]{4}-[0-9]+$'
       AND to_char(o.created_at,'YYYY')::int = to_char(now(),'YYYY')::int
       AND (regexp_replace(o.order_number, '^[A-Z]-[0-9]{4}-', ''))::int > v_amorce
  ) THEN
    RAISE EXCEPTION 'NU1 : un numéro déjà attribué dépasse le compteur — on ne valide pas.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VÉRIFICATION APRÈS EXÉCUTION (à passer, ne rien écrire)
-- ============================================================================
-- SELECT restaurant_id, annee, dernier FROM public.order_counters;
--   → attendu pour Rialto 2026 : dernier = 52 (le plus grand rang utilisé).
--   La prochaine commande portera donc R-2026-053, comme aujourd'hui.
--
-- ⚠️ NE PAS APPELER generate_order_number() « pour voir » : chaque appel
-- CONSOMME un rang. Un test manuel crée un trou dans la numérotation —
-- sans gravité, mais autant le savoir avant de le faire.
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- ⚠️ LE ROLLBACK REMET LE BUG. Il restaure le count(*)+1, donc la course ET
-- la redescente du compteur. À n'exécuter que si NU1 casse quelque chose de
-- pire, et à re-corriger dans la foulée.
-- ⚠️ ET IL A UNE CONDITION : si des commandes ont été créées depuis NU1,
-- `count(*)` ne retombera PAS sur le bon rang — il faut d'abord vérifier
-- que `count(*)` de l'année dépasse le plus grand rang attribué, sinon le
-- premier client d'après le rollback se fait refuser.
--
-- SET lock_timeout = '5s';
-- BEGIN;
-- CREATE OR REPLACE FUNCTION public.generate_order_number(p_restaurant uuid)
-- RETURNS text LANGUAGE plpgsql AS $function$
-- declare
--   v_slug text;
--   v_year text := to_char(now(),'YYYY');
--   v_count int;
-- begin
--   select upper(left(slug,1)) into v_slug from public.restaurants where id = p_restaurant;
--   select count(*)+1 into v_count from public.orders
--    where restaurant_id = p_restaurant and to_char(created_at,'YYYY') = v_year;
--   return coalesce(v_slug,'X') || '-' || v_year || '-' || lpad(v_count::text,3,'0');
-- end; $function$;
-- -- La table peut rester : elle ne gêne personne et garde la trace du rang.
-- -- DROP TABLE IF EXISTS public.order_counters;
-- COMMIT;
