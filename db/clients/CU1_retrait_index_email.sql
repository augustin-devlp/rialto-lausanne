-- ============================================================================
-- CU1 — RETRAIT DE `customers_email_unique`
-- Projet cible : ymnhfdkyqbhucxdrnyzq (base active Rialto)
-- STATUT : ✅ EXÉCUTÉE LE 22.08.2026 (GO Augustin), migration
--   `cu1_retrait_customers_email_unique`.
--   PREUVE : DEUX fiches ont été acceptées sur UNE MÊME adresse e-mail dans
--   une transaction annulée — le cas du foyer. Avant, le second INSERT
--   échouait en 23505.
--   CONTRE-ÉPREUVE : un doublon de TÉLÉPHONE est toujours refusé
--   (« duplicate key value violates unique constraint
--   "customers_phone_unique" »). La clé d'identité n'a pas bougé.
--   ⚠️ LE ROLLBACK CI-DESSOUS EST DÉSORMAIS SOUS CONDITION : il ne passera
--   que tant qu'aucune adresse ne porte deux fiches. Lire son avertissement
--   AVANT de l'exécuter.
--
-- ────────────────────────────────────────────────────────────────────────
-- LE BESOIN (décision Augustin 22.08.2026, actée)
-- ────────────────────────────────────────────────────────────────────────
-- 🔴 RÈGLE : L'IDENTITÉ D'UN CLIENT EST SON TÉLÉPHONE, JAMAIS SON E-MAIL.
--    L'e-mail est un CANAL, pas une CLÉ.
--
-- Un foyer qui partage une adresse e-mail est le cas NORMAL en
-- restauration : un couple, une colocation, une famille. Chacun commande
-- sous son numéro et donne la même adresse. L'index actuel traite ça comme
-- une violation d'intégrité.
--
-- ════════════════════════════════════════════════════════════════════════
-- CE QUE L'INDEX PROTÉGEAIT — LA QUESTION D'AUGUSTIN, RÉPONDUE SUR PIÈCES
-- ════════════════════════════════════════════════════════════════════════
-- RÉPONSE COURTE : RIEN. Ce n'est pas une décision, c'est un héritage.
--
-- SON ORIGINE, trouvée dans `supabase_migrations.schema_migrations` de la
-- base — le dépôt ne la contient pas :
--   version 20260617123113 — « rebuild_rialto_schema_from_reference_v2 »
--   17.06.2026, 38 783 caractères de DDL.
-- C'est LA MIGRATION DE DÉCOUPLAGE de l'ancienne base partagée Stampify.
-- Elle recrée le schéma « from reference », et l'index y est noyé dans un
-- bloc plat de CREATE INDEX consécutifs, SANS UNE LIGNE DE COMMENTAIRE,
-- juste avant son jumeau `customers_phone_unique`.
-- C'est la SEULE migration de toute l'histoire de la base qui le mentionne.
--
-- AUCUN LOT RIALTO NE L'A POSÉ. Aucun fichier de `db/` ne le crée — les
-- deux seules occurrences du nom dans le dépôt sont des commentaires du
-- 21.08.2026 qui le décrivent comme un piège SUBI, pas comme une intention.
--
-- CE QUI A ÉTÉ VÉRIFIÉ AVANT DE PROPOSER LE RETRAIT (tout en lecture seule
-- sur la base ymnhfdkyqbhucxdrnyzq) :
--   1. AUCUNE route ne cherche un client PAR e-mail. Zéro `.eq("email")`,
--      zéro `.in("email")`, zéro `.single()` sur un filtre e-mail. Le seul
--      filtre sur la colonne est `.is("email", null)` dans
--      `src/app/api/orders/route.ts` (garde anti-écrasement) : il ne
--      suppose aucune unicité.
--   2. AUCUN `upsert` avec `onConflict: "email"`. Les deux seuls upserts du
--      dépôt portent sur `endpoint` (push/subscribe).
--   3. AUCUNE fonction SQL ne lit `customers.email` (catalogue `pg_proc`).
--   4. AUCUN trigger sur `customers` — la table n'en a aucun.
--   5. AUCUNE politique RLS et AUCUNE vue ne mentionnent l'e-mail.
--   6. L'index N'ADOSSE AUCUNE CONTRAINTE : c'est un `CREATE UNIQUE INDEX`
--      nu, absent de `pg_constraint`. Aucune FK ne peut le référencer — un
--      index unique PARTIEL ne peut pas porter de clé étrangère en
--      Postgres. Rien ne se détache en cascade.
--   7. ÉTAT DES DONNÉES : 5 clients, 0 e-mail renseigné, 0 e-mail distinct.
--      L'INDEX N'A JAMAIS INDEXÉ UNE SEULE LIGNE.
--
--   Fidélité, parrainage et loterie — les trois pistes plausibles — sont
--   indexés sur le TÉLÉPHONE et sur `customer_id` :
--   `lottery_participants` est unique sur (lottery_id, phone, month),
--   `referrals` porte referrer_customer_id / referee_customer_id,
--   `customer_cards` porte customer_id + short_code.
--   Détail parlant : la table sœur `rialto_customers`, née du même
--   découplage et porteuse d'un `email` elle aussi, est unique sur
--   (restaurant_id, phone) — PAS sur l'e-mail. Personne dans ce schéma n'a
--   jamais traité l'e-mail comme une identité.
--
-- ════════════════════════════════════════════════════════════════════════
-- CE QU'IL COÛTE AUJOURD'HUI — DEUX DÉFAUTS RÉELS, PAS UN
-- ════════════════════════════════════════════════════════════════════════
-- ⚠️ Ces deux défauts étaient DORMANTS jusqu'au 21.08 : avant cette date
-- l'e-mail n'était JAMAIS écrit sur la fiche client, donc l'index n'était
-- jamais touché. Depuis que l'e-mail est obligatoire au checkout, il est
-- écrit à CHAQUE commande. LES DEUX DÉFAUTS SONT ARMÉS DEPUIS HIER.
--
-- (1) COMMANDE — `src/app/api/orders/route.ts`, bloc « Nouveau customer ».
--     Le second membre du foyer déclenche un 23505. La reprise posée le
--     21.08 le sauve : on recrée le client SANS e-mail. La commande passe,
--     mais SA FICHE N'AURA JAMAIS D'ADRESSE — donc pas de lien de connexion
--     plus tard, et un client manquant dans la base vendue au restaurateur.
--     C'est le coût que la rustine ne paie pas, et la raison n°1 de cette
--     migration.
--
-- (2) CARTE DE FIDÉLITÉ — `src/app/api/rialto/loyalty/signup/route.ts`,
--     branche « Nouveau customer + nouvelle carte ». Ici il n'y a AUCUNE
--     reprise : `if (custErr || !newCustomer)` renvoie un 500 sec.
--     Le second membre du foyer NE PEUT PAS créer sa carte, point.
--     ⚠️ ET LA ROUTE RENVOIE `custErr.message` AU CLIENT — c'est-à-dire
--     « duplicate key value violates unique constraint
--     "customers_email_unique" » affiché à un client de pizzeria. Fuite
--     d'information de schéma, en plus du refus.
--     Ce défaut est PIRE que le premier et il n'a pas de rustine.
--
-- (3) TROISIÈME RAISON, décision d'Augustin du 22.08 sur la session
--     client : le lien de connexion par e-mail doit, quand une adresse
--     porte DEUX comptes, PROPOSER DE CHOISIR — jamais en supposer un.
--     Cette mécanique est impossible tant que la base interdit deux comptes
--     sur une même adresse.
--
-- ════════════════════════════════════════════════════════════════════════
-- AVANT D'EXÉCUTER — LA SEULE CHOSE QUE JE N'AI PAS PU CLORE D'ICI
-- ════════════════════════════════════════════════════════════════════════
-- Le dépôt `servato-caisse` écrit dans la MÊME base et n'est pas lisible
-- depuis cette conversation. Le périmètre écrit dans
-- `db/security/lot1_rls_tables_clients.sql` dit que la caisse ne touche que
-- orders / order_items / order_status_history / caisse_access — mais ce
-- périmètre date du 01.05.2026 et le lot CL1 du 21.08 a élargi son rôle.
--   👉 PASSER `grep -ri email` SUR servato-caisse AVANT LE DROP.
--   Si la caisse ne lit jamais un client par son e-mail — ce qui est
--   attendu — il ne reste aucune réserve.
--
-- ============================================================================
-- MIGRATION
-- ============================================================================

-- ⚠️ `lock_timeout` : la règle écrite du projet impose cette garde pour
-- toute migration touchant `orders`. CETTE MIGRATION TOUCHE `customers`,
-- pas `orders` — je l'étends par analogie, ET JE LE SIGNALE COMME UNE
-- EXTENSION DE MA PART, pas comme la règle telle qu'elle est écrite.
-- La raison vaut à l'identique : `DROP INDEX` prend un ACCESS EXCLUSIVE sur
-- la table. Instantané sur 5 lignes, mais s'il se met en file derrière un
-- verrou long, il gèle tous les accès à `customers` — donc le checkout, la
-- fidélité et le scan au comptoir. Mieux vaut échouer en 5 s que geler.
SET lock_timeout = '5s';

BEGIN;

-- L'objet est un INDEX NU, pas une contrainte : `DROP INDEX`, et surtout
-- PAS `ALTER TABLE ... DROP CONSTRAINT`, qui échouerait puisque l'objet
-- n'existe pas dans `pg_constraint`.
-- `IF EXISTS` : rejouable sans erreur.
DROP INDEX IF EXISTS public.customers_email_unique;

-- Contrôle immédiat, dans la MÊME transaction : si l'index est encore là,
-- on ne valide pas.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'customers_email_unique'
  ) THEN
    RAISE EXCEPTION 'CU1 : customers_email_unique est toujours present, on ne valide pas.';
  END IF;
END $$;

-- ⚠️ ON NE TOUCHE PAS `customers_phone_unique`. C'est la clé d'identité
-- réelle, et tout le dépôt en dépend via `phoneLookupVariants`.
-- Sa présence est vérifiée ici pour qu'un DROP mal ciblé ne passe jamais.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'customers_phone_unique'
  ) THEN
    RAISE EXCEPTION 'CU1 : customers_phone_unique a disparu, la cle d identite est perdue, on annule.';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- 🔴 ROLLBACK — LIRE AVANT DE L'EXÉCUTER, IL N'EST PAS TOUJOURS EXÉCUTABLE
-- ============================================================================
-- ⚠️⚠️ CE ROLLBACK A UNE DATE DE PÉREMPTION.
-- Il recrée un index UNIQUE. Il ne peut donc réussir QUE tant qu'aucune
-- adresse e-mail n'est portée par deux fiches. Or c'est exactement ce que
-- la migration autorise : dès le PREMIER foyer qui commande à deux numéros
-- avec la même adresse, `CREATE UNIQUE INDEX` échoue.
--
-- Autrement dit : cette migration est réversible AUJOURD'HUI — 5 clients,
-- 0 e-mail — et devient IRRÉVERSIBLE EN PRATIQUE peu après le go-live.
-- Ce n'est pas un défaut du rollback, c'est la nature du changement. Mais
-- il ne faut pas le découvrir un soir de service.
--
-- LE CONTRÔLE À PASSER AVANT TOUTE TENTATIVE DE ROLLBACK :
--
--   SELECT email, count(*) AS fiches
--   FROM public.customers
--   WHERE email IS NOT NULL
--   GROUP BY email
--   HAVING count(*) > 1
--   ORDER BY fiches DESC;
--
--   → 0 ligne : le rollback ci-dessous passera.
--   → au moins 1 ligne : IL ÉCHOUERA. Et il ne faut PAS « nettoyer » les
--     doublons pour le faire passer : ces doublons sont des CLIENTS RÉELS
--     d'un même foyer. Effacer une adresse pour restaurer un index, c'est
--     casser du vrai pour réparer de l'artificiel.
--
-- LE ROLLBACK LUI-MÊME :
--
-- SET lock_timeout = '5s';
-- BEGIN;
-- CREATE UNIQUE INDEX customers_email_unique
--   ON public.customers USING btree (email)
--   WHERE (email IS NOT NULL);
-- COMMIT;
--
-- ============================================================================
-- APRÈS L'EXÉCUTION — HYGIÈNE, HORS DDL
-- ============================================================================
-- Ces trois points ne sont PAS du DDL et ne sont pas faits par ce fichier.
-- Ils sont listés ici pour qu'ils ne soient pas oubliés : la règle R8
-- interdit de laisser un commentaire qui décrit un piège disparu.
--
-- 1. `src/app/api/orders/route.ts` — deux blocs de commentaire décrivent le
--    piège d'unicité : celui du « Nouveau customer » et celui du rattrapage
--    e-mail. Ils deviendront FAUX. Les redater plutôt que les effacer :
--    l'histoire explique pourquoi la reprise 23505 existe encore.
--    ⚠️ NE PAS retirer la reprise 23505 elle-même : elle reste vivante et
--    nécessaire pour les collisions de TÉLÉPHONE.
--
-- 2. `src/app/api/rialto/loyalty/signup/route.ts` — le 500 cesse d'être
--    déclenché par l'e-mail, mais LA FUITE DU MESSAGE POSTGRES AU CLIENT
--    RESTE : `custErr?.message` est renvoyé tel quel. À corriger
--    séparément, c'est un défaut indépendant de cet index.
--
-- 3. `console.warn("[orders] rattrapage e-mail client sans effet")` cesse
--    de se déclencher pour la cause e-mail. Il reste utile pour les autres.
