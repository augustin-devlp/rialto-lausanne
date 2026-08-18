-- ============================================================================
-- ZL1 — Refonte des zones de livraison : grille 4 anneaux, 64 NPA
-- Chantier zones (GO Augustin 18.08.2026, phase B — décisions 1 à 10).
-- STATUT : ✅ EXÉCUTÉE le 19.08.2026 via apply_migration
--          (zl1_grille_4_anneaux) après GO caisse (verdict : aucun
--          lecteur côté caisse, rollback vérifié 13/13 fidèle au live).
--          Post-vérif conforme : 64 zones actives (15 A + 11 B + 19 C +
--          19 D), threshold recyclé 15.00, enabled false. État AVANT
--          confirmé identique à l'ARCHIVE en fin de fichier.
-- ============================================================================
--
-- CE QUE FAIT CE SQL, EXACTEMENT — DONNÉES UNIQUEMENT, AUCUN DDL :
--   1. UPSERT des 64 NPA de la grille validée dans delivery_zones :
--      les 13 lignes existantes sont MISES À JOUR EN PLACE (mêmes id →
--      la FK orders.delivery_zone_id reste valide, l'historique intact),
--      les ~51 nouvelles sont INSÉRÉES. JAMAIS de DELETE : la FK est
--      ON DELETE SET NULL — un delete casserait le lien des commandes
--      et ferait retomber le moteur ETA sur son défaut optimiste.
--   2. La grille (min / frais / estimated_delivery_minutes — ce dernier
--      est un temps TOTAL porte-à-porte dont le moteur ETA extrait le
--      trajet via ZONE_TRAJET_OFFSET=25) :
--        🟢 A : min 25 / fee 5  / eta 35   (→ affiche « 30–40 min » à vide)
--        🟡 B : min 35 / fee 5  / eta 35   (→ « 30–40 min »)
--        🟠 C : min 45 / fee 8  / eta 45   (→ « 40–50 min »)
--        🔴 D : min 55 / fee 12 / eta 50   (→ « 45–55 min »)
--      ⭐ EXCEPTION 1012 Chailly (décision 4) : anneau A pour le min (25)
--      mais GARDE fee 0.00 (gratuité historique du quartier du
--      restaurant) et eta 30 (→ « ~20–25 min »).
--      1015 Dorigny : anneau C (décision 5, aligné Écublens/St-Sulpice).
--      1010/1011 : anneau A (décision 6, à confirmer au restaurateur —
--      un UPDATE ultérieur les rebasculerait sans DDL).
--   3. UPDATE restaurants.free_delivery_threshold = 15.00 : la colonne
--      est RECYCLÉE en OFFSET du seuil de gratuité par zone
--      (seuil = min_order_amount de la zone + cet offset — décision 2).
--      free_delivery_enabled N'EST PAS TOUCHÉ (reste false) :
--      l'activation est un geste dashboard, pas une migration.
--   4. 1001/1002 (cases postales) ne sont PAS insérés : leur refus
--      explicite est porté par le code (champ reason de
--      /api/delivery-zones/check), pas par la table.
--
-- ⚠️⚠️ ORDRE DE DÉPLOIEMENT NON NÉGOCIABLE (relecture 18.08, amendé au
-- retour de navette caisse 19.08 — pattern maison, cf. loyalty/pending.ts) :
--   1. Exécuter ZL1. ⚠️ EFFET IMMÉDIAT SUR LA GRILLE (correction caisse :
--      « inerte tant que enabled=false » était FAUX) : delivery_zones est
--      lue EN DIRECT par le code prod — à la seconde de l'exécution, les
--      ~51 nouveaux NPA deviennent commandables et les minimums/frais/ETA
--      des 13 existants changent pour toute nouvelle qualification.
--      Seul le VOLET SEUIL (recyclage threshold→offset) est inerte tant
--      que free_delivery_enabled = false. Fenêtre COURTE, hors service ;
--      AUCUN geste au dashboard livraison entre les étapes.
--   2. Déployer le code de la refonte DANS LA FOULÉE (il inclut le bump
--      localStorage ADDRESS V3 qui invalide les adresses périmées, et la
--      nouvelle liste de villes du footer — déployer le code SANS ZL1
--      ferait mentir la vitrine sur la couverture).
--   3. SEULEMENT APRÈS 1+2 (et quelques heures de renouvellement des
--      bundles clients) : activer le toggle au dashboard.
-- CONSTAT D'EXÉCUTION 19.08 : le déploiement Vercel étant automatique au
-- push, l'étape 2 était DÉJÀ FAITE (commit 0cab4f8 en prod) — fenêtre
-- inversée constatée et assumée : ZL1 exécutée en urgence pour réaligner
-- la base sur la vitrine, toggle toujours false pendant l'opération.
--
-- 🔒 RÈGLE PERMANENTE (post-activation, caisse 19.08) : APRÈS ACTIVATION
-- DU TOGGLE, COUPER free_delivery_enabled AVANT TOUT ROLLBACK DU CODE —
-- TOUJOURS. Un revert du code fait relire l'offset (15) comme SEUIL
-- ABSOLU → livraison gratuite sur 100 % des commandes livrées ; si
-- l'offset a été modifié au dashboard entre-temps, même le rollback data
-- ci-dessous ne rattrape pas (il est borné à la valeur 15).
--
-- ⚠️ REJOUABILITÉ SOUS CONDITION (caisse 19.08) : le rejeu de l'UPSERT
-- n'est sûr que TANT QU'AUCUN éditeur dashboard des zones n'existe. Le
-- jour où le restaurateur peut modifier delivery_zones depuis un écran :
-- REJEU INTERDIT (il écraserait ses réglages) — toute rebascule d'anneau
-- passe alors par une navette ZLn dédiée.
--
-- 📌 DETTE DDL (à porter dans la PROCHAINE navette DDL, caisse 19.08) :
-- COMMENT ON COLUMN restaurants.free_delivery_threshold — col_description
-- est NULL alors que la colonne a changé de sémantique (seuil→offset).
-- C'est mot pour mot le piège business_id déjà payé une fois.
-- PHRASE D'ARRÊT : tant que le code lisant free_delivery_threshold
-- comme OFFSET n'est pas en prod, ne JAMAIS activer
-- free_delivery_enabled — le code actuel le lit comme un SEUIL ABSOLU :
-- avec la valeur 15 posée par ZL1, la livraison deviendrait GRATUITE
-- sur 100 % des commandes livrées (toute commande passe le minimum de
-- zone ≥ 25, donc ≥ 15). Inversement, activer avec le code neuf mais
-- SANS ZL1 lirait l'ancien 50 comme offset → seuils 85-100 CHF,
-- promesse commerciale inatteignable (garde-fou UI au dashboard en
-- renfort, mais la séquence 1→2→3 est LA protection).
--
-- IMPACT CAISSE ATTENDU : AUCUN. La caisse ne lit pas delivery_zones ;
-- les commandes existantes portent des montants snapshotés à l'écriture.
-- Les pages de suivi OUVERTES pendant l'exécution verront l'ETA de zone
-- changer au poll suivant — le cliquet d'affichage client absorbe
-- (jamais de recul) ; exécution hors heures de service recommandée par
-- simple prudence, pas nécessaire.
--
-- VERROUS / COÛT : UPSERT de 64 lignes + UPDATE d'1 ligne restaurants =
-- verrous ROW EXCLUSIVE brefs sur delivery_zones et restaurants. Aucun
-- accès à orders. lock_timeout par convention maison.
--
-- CONTRAINTE D'UPSERT VÉRIFIÉE EN BASE le 18.08.2026 (pg_constraint) :
-- delivery_zones_restaurant_id_postal_code_key UNIQUE (restaurant_id,
-- postal_code) — l'ON CONFLICT cible une contrainte RÉELLE. Pre-flight
-- avant exécution (doit renvoyer 1 ligne) :
--   SELECT conname FROM pg_constraint
--   WHERE conrelid = 'delivery_zones'::regclass AND contype = 'u';
--
-- NOTE city : plusieurs lignes portent un libellé MULTI-COMMUNES
-- (« Bottens / Poliez-Pittet / … ») — c'est un libellé DESCRIPTIF de
-- couverture. Le POST /api/orders privilégie désormais la ville SAISIE
-- par le client (refonte 18.08) : le libellé de zone n'est qu'un repli,
-- il ne finit plus sur l'étiquette livreur.
--
-- REJOUABLE : oui — ON CONFLICT (restaurant_id, postal_code) DO UPDATE
-- (l'UPSERT réaligne la grille à chaque exécution) ; l'UPDATE
-- restaurants est BORNÉ à la valeur legacy (50.00) : un rejeu ultérieur
-- de ZL1 n'écrase JAMAIS un offset réglé entre-temps par le
-- restaurateur au dashboard (relecture 18.08).
--
-- ROLLBACK (inline, EXÉCUTABLE EN UN BLOC — restaure l'état antérieur
-- complet, relecture 18.08) :
--   SET lock_timeout = '5s';
--   UPDATE delivery_zones SET is_active = false
--     WHERE restaurant_id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
--     AND postal_code NOT IN ('1004','1005','1006','1007','1008','1009',
--       '1010','1011','1012','1018','1024','1052','1066');
--   INSERT INTO delivery_zones (restaurant_id, postal_code, city,
--     delivery_fee, min_order_amount, estimated_delivery_minutes, is_active)
--   VALUES
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1012','Lausanne (Chailly)',0.00,25.00,30,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1018','Lausanne (Bellevaux)',5.00,35.00,35,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1004','Lausanne',5.00,35.00,40,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1005','Lausanne',5.00,35.00,40,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1006','Lausanne',5.00,35.00,40,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1007','Lausanne',5.00,35.00,40,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1008','Prilly',7.00,40.00,45,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1009','Pully',7.00,40.00,45,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1052','Le Mont-sur-Lausanne',7.00,40.00,45,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1066','Epalinges',7.00,40.00,45,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1010','Lausanne',10.00,50.00,50,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1011','Lausanne',10.00,50.00,50,true),
--     ('046d930d-a4cd-4a43-a11a-7f76bfe74b06','1024','Ecublens',10.00,45.00,55,true)
--   ON CONFLICT (restaurant_id, postal_code) DO UPDATE SET
--     city = EXCLUDED.city, delivery_fee = EXCLUDED.delivery_fee,
--     min_order_amount = EXCLUDED.min_order_amount,
--     estimated_delivery_minutes = EXCLUDED.estimated_delivery_minutes,
--     is_active = EXCLUDED.is_active;
--   UPDATE restaurants SET free_delivery_threshold = 50.00
--     WHERE id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
--     AND free_delivery_threshold = 15.00;
-- ============================================================================

SET lock_timeout = '5s';

INSERT INTO delivery_zones
  (restaurant_id, postal_code, city, delivery_fee, min_order_amount,
   estimated_delivery_minutes, is_active)
VALUES
  -- ═══ 🟢 ANNEAU A (0-4 km) — min 25 / fee 5 / eta 35 ═══
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1003', 'Lausanne', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1004', 'Lausanne', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1005', 'Lausanne', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1006', 'Lausanne', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1007', 'Lausanne', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1010', 'Lausanne', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1011', 'Lausanne (CHUV)', 5.00, 25.00, 35, true),
  -- ⭐ EXCEPTION Chailly (décision 4) : fee 0 + eta 30 conservés
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1012', 'Lausanne (Chailly)', 0.00, 25.00, 30, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1018', 'Lausanne (Bellevaux)', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1009', 'Pully', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1094', 'Paudex', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1092', 'Belmont-sur-Lausanne', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1068', 'Les Monts-de-Pully', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1066', 'Epalinges', 5.00, 25.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1052', 'Le Mont-sur-Lausanne', 5.00, 25.00, 35, true),
  -- ═══ 🟡 ANNEAU B (4-8 km) — min 35 / fee 5 / eta 35 ═══
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1008', 'Prilly / Jouxtens-Mézery', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1020', 'Renens', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1022', 'Chavannes-près-Renens', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1023', 'Crissier', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1032', 'Romanel-sur-Lausanne', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1033', 'Cheseaux-sur-Lausanne', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1053', 'Cugy / Bretigny-sur-Morrens', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1095', 'Lutry', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1090', 'La Croix (Lutry)', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1073', 'Savigny', 5.00, 35.00, 35, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1000', 'Lausanne 25-27 (Vers-chez-les-Blanc, Chalet-à-Gobet, Montheron)', 5.00, 35.00, 35, true),
  -- ═══ 🟠 ANNEAU C (8-12 km) — min 45 / fee 8 / eta 45 ═══
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1024', 'Ecublens', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1025', 'Saint-Sulpice', 8.00, 45.00, 45, true),
  -- 1015 : anneau C (décision 5 — campus physiquement dans C)
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1015', 'Lausanne-Dorigny', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1029', 'Villars-Sainte-Croix', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1030', 'Bussigny', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1031', 'Mex', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1026', 'Denges / Echandens', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1028', 'Préverenges', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1036', 'Sullens', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1037', 'Etagnières', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1034', 'Boussens', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1054', 'Morrens', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1055', 'Froideville', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1081', 'Montpreveyres', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1072', 'Forel (Lavaux)', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1091', 'Grandvaux / Villette / Aran / Chenaux', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1096', 'Cully', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1097', 'Riex', 8.00, 45.00, 45, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1098', 'Epesses', 8.00, 45.00, 45, true),
  -- ═══ 🔴 ANNEAU D (12-16 km) — min 55 / fee 12 / eta 50 ═══
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1110', 'Morges', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1027', 'Lonay', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1121', 'Bremblens', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1122', 'Romanel-sur-Morges', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1123', 'Aclens', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1131', 'Tolochenaz', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1132', 'Lully VD', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1302', 'Vufflens-la-Ville', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1303', 'Penthaz', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1035', 'Bournens', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1042', 'Assens / Bioley-Orjulaz', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1040', 'Echallens / St-Barthélemy / Villars-le-Terroir', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1041', 'Bottens / Poliez-Pittet / Poliez-le-Grand / Dommartin / Naz', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1071', 'Chexbres / Rivaz / Saint-Saphorin', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1070', 'Puidoux', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1080', 'Les Cullayes', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1083', 'Mézières VD', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1077', 'Servion', 12.00, 55.00, 50, true),
  ('046d930d-a4cd-4a43-a11a-7f76bfe74b06', '1058', 'Villars-Tiercelin', 12.00, 55.00, 50, true)
ON CONFLICT (restaurant_id, postal_code) DO UPDATE SET
  city = EXCLUDED.city,
  delivery_fee = EXCLUDED.delivery_fee,
  min_order_amount = EXCLUDED.min_order_amount,
  estimated_delivery_minutes = EXCLUDED.estimated_delivery_minutes,
  is_active = EXCLUDED.is_active;

-- Décision 2 : la colonne threshold est recyclée en OFFSET (seuil de
-- gratuité = min de zone + offset). enabled n'est pas touché (false).
-- BORNÉ à la valeur legacy 50.00 : un rejeu de ZL1 (rebasculer une zone
-- d'anneau) n'écrase jamais un offset réglé depuis au dashboard.
UPDATE restaurants
SET free_delivery_threshold = 15.00
WHERE id = '046d930d-a4cd-4a43-a11a-7f76bfe74b06'
  AND free_delivery_threshold = 50.00;

-- ============================================================================
-- ARCHIVE — les 13 valeurs ANTÉRIEURES à ZL1 (pour rollback manuel) :
--   1012 Chailly fee 0/min 25/eta 30 (inchangé) · 1018 fee 5/min 35/eta 35 ·
--   1004-1007 fee 5/min 35/eta 40 · 1008 fee 7/min 40/eta 45 ·
--   1009+1052+1066 fee 7/min 40/eta 45 · 1010+1011 fee 10/min 50/eta 50 ·
--   1024 fee 10/min 45/eta 55 · restaurants.free_delivery_threshold 50.00
-- ============================================================================
