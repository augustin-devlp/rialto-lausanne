# Balayage des phrases de sûreté — inventaire

**21.08.2026** · Balayage LARGE : **tout le dépôt** (`src/`, `docs/`, `db/`),
et non plus les seuls fichiers modifiés — c'est l'erreur du premier passage.

**Ce document est un INVENTAIRE, pas un lot de correctifs.** Seules les
fausses garanties de ma propre main ont été corrigées à vue (commit
`9c82adc`), comme la règle R8 l'impose. Tout le reste attend une décision.

⚠️ **Chaque verdict ci-dessous a été rendu par un agent de relecture.** Les
cinq majeures que j'ai corrigées, je les ai d'abord vérifiées moi-même sur
le code. **Les autres ne le sont pas** : avant d'agir sur l'une d'elles,
la rouvrir et la vérifier. Un agent qui dit « c'est faux » n'est pas une
preuve.

---

# INVENTAIRE DES PHRASES DE SÛRETÉ — rialto-lausanne, 21.08.2026

## 1. Le compte

| | phrases |
|---|---|
| **Examinées** | **1038** |
| Vraies et évidentes (garde à côté) | 781 — 75,2 % |
| Vraies mais lointaines (garde ailleurs, non citée) | 219 — 21,1 % |
| **FAUSSES** | **38 — 3,7 %** |

Dont **10 majeures** et 28 mineures.

Chiffre comparable à l'autre dépôt : **1038 examinées, 38 fausses** (l'autre : 262 / 30, soit 11,5 %). Le taux est trois fois meilleur, mais le volume absolu de phrases de sûreté est quatre fois plus élevé — et les 219 « lointaines » sont, elles, la dette directe que crée la règle du 21.08 : chacune est aujourd'hui interdite d'écriture en l'état.

Par lot : L1 74 (3 F) · L2 84 (2 F) · L3 105 (7 F) · L4 145 (4 F) · L5 97 (4 F) · L6 108 (2 F) · L7 110 (4 F) · L8 101 (4 F) · L9 95 (4 F) · L10 119 (4 F).

---

## 2. Les 10 FAUSSES majeures

**M-1 · `db/livraison/LS0_seuil_livraison_offerte.sql:38-43`**
Affirme : `POST /api/orders` rend la livraison gratuite si le sous-total ≥ `free_delivery_threshold`.
Fait : la colonne a été recyclée en OFFSET par ZL1 (`db/zones/ZL1_grille_4_anneaux.sql:240-242` la pose à 15.00). Le seuil effectif est dérivé par zone : `src/lib/delivery/rule.ts:55-67` et `:70+`. Lire la phrase telle quelle = livraison gratuite sur presque tout.
Correction de la phrase : la marquer PÉRIMÉE DEPUIS ZL1 et renvoyer à `freeDeliveryThresholdForZone`.

**M-2 · `db/livraison/LS0_seuil_livraison_offerte.sql:19-21`**
Affirme : « le seuil est une règle RESTAURANT ».
Fait : c'est une règle PAR ZONE depuis ZL1 (`rule.ts:55-56` écrit « le nom de colonne ment »). Corollaire non écrit : le bloc ROLLBACK L31-35 (`DROP COLUMN`) casserait `toFreeDeliveryRule` en prod.
Correction : dater — « à la date de LS0, oui ; plus depuis ZL1 » — et signaler que le rollback n'est plus exécutable tel quel.

**M-3 · `db/zones/ZL1_grille_4_anneaux.sql:79-84`**
Affirme (PHRASE D'ARRÊT) : ne JAMAIS activer `free_delivery_enabled`, le code lit la colonne comme un seuil absolu.
Fait : le code lit un OFFSET depuis le 19.08 (`rule.ts:62`, `:72-77`) et les 5 lecteurs passent tous par `toFreeDeliveryRule`. Le fichier se contredit lui-même L57-60. La « DETTE DDL » L75-78 est elle aussi périmée (payée par `HY1b_hygiene_orders.sql:140-148`).
Correction : la condition d'arrêt est LEVÉE ; ne reste vraie que la règle de rollback.

**M-4 · `db/fidelite/F7_retrait_tampons_renversement.sql:441` (+235, 366, 401-402 en `COMMENT ON FUNCTION`)**
Affirme au présent : « le filet cron rattrapera », « le filet cron appelle ce RPC en masse ».
Fait : le filet n'existe pas. `rialto_sync_order_stamps` : 0 occurrence dans `src/`. `src/app/api/cron/loyalty-settle/route.ts` n'appelle que `rialto_cloture_service` et `crediteCommandes`, cette dernière filtrée `.in("status", SOLID_STATUSES)` — une `cancelled` n'y entre jamais. Le fichier lui-même liste le filet en « CE QUI SUIT, HORS DDL » (L579-591) et reconnaît que sans lui, toute exception avalée par le trigger est une PERTE DÉFINITIVE. Ces phrases servent de justification à deux décisions de conception (handler qui avale 5 classes d'erreurs, sortie sans verrou).
Correction : conditionnel + TODO ; surtout corriger le `COMMENT ON FUNCTION`, qui part EN BASE et deviendra la seule doc lisible.

**M-5 · `db/fidelite/F3b_credit_order_stamps_durci.sql:14-21`**
Affirme : le tampon se reprend si la commande acceptée est ensuite refusée, via `rialto_sync_order_stamps`, ce qui libère la clé d'idempotence.
Fait : rien de tout cela n'est en production. F7 porte « STATUT : NON EXÉCUTÉE » à sa ligne 4, et `CL0_reparation_refus_ecrases.sql:124-125` confirme qu'aucun trigger fidélité n'existe. Aujourd'hui, accepted→cancelled GARDE son tampon — l'exploit que l'amendement prétend fermer.
Correction : futur + date d'état réel.

**M-6 · `src/components/checkout/UpsellPanel.tsx:173-174`**
Affirme : « une carte qui affiche un prix ne survit jamais à un changement de son assiette ».
Fait : la clé de l'effet (`cartKey`, L107-110) = `menu_item_id` × `quantity`, **sans les options** — alors que le même fichier (L193-201) déclare que les options font partie de l'assiette et modifient le palier. Un changement d'options à quantité égale ne déclenche ni vidage ni refetch : la carte P2 et son « la livraison passe de 10.00 à 0.00 » survivent.
Correction : c'est le scénario décrit L196-199 ; la phrase promet ce que la clé ne couvre pas.

**M-7 · `src/lib/upsell/chemins.ts:214-218`**
Affirme, en « ⚠️ FORMULATION EXACTE » : sur un panier burger + pâtes, la branche PÂTES répond avant et propose une salade.
Fait : l'inverse exact. `if (analysis.hasFriesIncluded) return null;` est en TÊTE de `cheminP4` (L230), avant le dispatch (L239-278), et `hasFriesIncluded` est global au panier (`cartAnalysis.ts:80`). P4 rend `null` immédiatement, la branche PÂTES n'est jamais atteinte.
Correction : la « formulation exacte » décrit un comportement que le fichier n'implémente pas.

**M-8 · `src/app/api/orders/[id]/confirm-delivered/route.ts:90-96`**
Affirme : « l'uuid v4 est un jeton de capacité […] acceptable SANS auth ni rate limit ».
Fait : bloc mort, contredit 30 lignes plus haut par le même fichier (L45-57 : « le pari était FAUX ») ; la route exige désormais `verifyOrderToken` et renvoie 404 sans jeton HMAC valide.
Correction : le danger n'est pas l'inexactitude, c'est qu'un lecteur conclut que le jeton est superflu et le retire.

**M-9 · `src/lib/eta/server.ts:33-37`**
Affirme : « TOUTE défaillance de collecte dégrade vers le PRUDENT ».
Fait : vrai pour les défaillances partielles (items, history, zones). Faux pour la principale : l'échec de lecture des commandes actives (L167-175) retourne `pizzas_en_cuisine_devant: 0` ET `retour_livreur_minutes: 0`, les valeurs les plus optimistes. La seule compensation (`poids_prior = 0.6`) vaut ZÉRO hors des fenêtres 12-14h / 19-21h (`eta.ts:133-137`). Hors rush, une panne totale rend l'ETA le plus court possible.
Correction : la doctrine énoncée est l'inverse du comportement du chemin le plus probable.

**M-10 · `src/lib/tracking.ts:300-309`**
Affirme, en gras : « **Le jeton part donc encore chez Meta à chaque ouverture de la page de suivi.** »
Fait : la fuite est fermée 15 lignes plus bas dans le MÊME fichier — `meta()` (L83-86) fait `if (surPageDeSuivi()) return;` et tous les tirs Meta passent par `meta()`. L'en-tête L325-343 le dit d'ailleurs au passé. Résidu réel mais différent : `fbevents.js` et `fbq('init')` restent chargés sur /confirmation (L174-180).
Correction : une affirmation de fuite de secret encore ouverte alors qu'elle est fermée — coût direct en temps de panique et en décisions inutiles.

---

## 3. Les 38 par MOTIF

### M1 — « Le code a bougé, la phrase est restée » — 10 cas (dont 5 des 10 majeures)
Le plus coûteux. La phrase était vraie à l'écriture ; un refactor, une suppression ou un recyclage l'a périmée sans que personne ne repasse l'en-tête.
- **M-1, M-2, M-3** (free_delivery_threshold recyclé en offset) · **M-8** (jeton signé) · **M-10** (fuite Meta fermée)
- `src/app/api/orders/route.ts:470` — « Pickup : obligatoire. Delivery : optionnelle » : l'heure est optionnelle dans tous les cas, et le retrait est impossible depuis L273. Vestige du bloc horaires supprimé le 21.08.
- `src/lib/eta/constants.ts:26-27` — « `prep_time_minutes` reste cantonnée à la validation de créneau pickup » : cette validation a été supprimée le 21.08 (`orders/route.ts:481-494`) ; la colonne n'est plus lue nulle part. En-tête daté du 18.08, jamais repassé.
- `src/lib/clientStore.ts:101-103` — « les 5 chemins historiques » : la liste en énumère six, dont l'upsell checkout retiré le 20.08 (`CheckoutPageClient.tsx:796`). Il en reste quatre.
- `src/components/checkout/CheckoutPageClient.tsx:856-860` — « l'erreur de zone doit rester VISIBLE en vue compacte » : plus aucun état d'erreur de zone n'existe dans ce composant depuis la refonte du 20.08 ; le pop-up ne committe rien et reste ouvert.
- `src/components/brand/RialtoLogo.tsx:8-9` — halo de lisibilité promis : il n'existe que dans `variant="fixed"`, qu'aucun appelant n'utilise. `GlobalLogo`, cité dans la même phrase, n'existe nulle part.

**Fait notable : trois changements de code ont orphelin sept phrases** — le recyclage de `free_delivery_threshold` (3), la suppression du bloc horaires pickup (2), la fermeture de la fuite Meta (2). Cinq des dix majeures viennent de ces trois événements.

### M2 — « Le futur écrit au présent de l'indicatif » — 2 cas (2 majeures)
**M-4** et **M-5**. Même mécanique : la DDL et sa documentation sont rédigées dans la même passe, avant la livraison, et le fichier décrit l'état post-livraison. Puis la navette n'est pas exécutée. Aggravant : dans les deux cas, la phrase sert de justification à une décision de conception risquée (avaler des exceptions, sortir sans verrou), et l'une part en base dans un `COMMENT ON FUNCTION`.

### M3 — « Le quantificateur absolu démenti par une branche » — 17 cas (1 majeure)
La phrase décrit correctement le chemin principal ; un chemin oublié la rend fausse. Marqueur : *jamais, toujours, tout, exclusivement, à vie*.
- **M-9** (server.ts) — majeure.
- `src/lib/eta/server.ts:10-19` — « intrants DÉTERMINISTES » : `poidsPrior` L354 fait `.neq("status","cancelled")`, un filtre lu au PRÉSENT, alors que le fichier s'interdit explicitement ce motif L149-157. Un refus après l'ancre change l'ETA au poll suivant.
- `src/lib/eta/phase.ts:45` — « jamais moins avancé que la base » : la branche `acceptedAt` non parsable (L112-121) renvoie `confirmed` en dur sans appeler `plancherStatut` ; une commande `ready` s'afficherait « Confirmée ». La branche jumelle L97-99, elle, applique le plancher.
- `db/orders/TAP1_customer_confirmed_delivered.sql:22-24` (+ `COMMENT ON COLUMN`) — « le site n'écrit JAMAIS `orders.status` » : il l'écrit une fois, à la création (`orders/route.ts:522`). Ce qui est vrai : aucune TRANSITION n'est écrite par le site.
- `src/lib/tracking.ts:325-326` — « TOUT APPEL À META PASSE PAR ICI, ET NULLE PART AILLEURS » : vrai pour le reste du dépôt, faux dans le fichier lui-même — `fbq("init")` L180, l'appel qui s'exécute justement sur /confirmation.
- `src/lib/promoCodes.ts:17-18` — « on filtre TOUJOURS par BUSINESS_ID » : vrai pour `generatePromoCode` et `validatePromoCode`, faux pour `consumePromoCode`, `releasePromoCode` et `markPromoCodeUsedOnOrder`, qui ciblent par id seul. Pas d'exploit aujourd'hui (id toujours issu de `validatePromoCode`, base mono-tenant).
- `src/lib/eta/eta.ts:20` — « toutes les valeurs de calibrage vivent dans `./constants.ts` » : trois familles sont en dur ici (diviseur 0.5 L136, seuils L100-105, redupliqués L202-207 et L232-242). Qui recalibre en n'ouvrant que `constants.ts` ne les trouve pas.
- `src/lib/menu/collections.ts:32-33` — « s'il ouvre un rail, il ferme l'autre » : faux dans 6 cas sur 12 (Lasagne, Capriccioza, Végétarienne, Crevettes, Tortellonis, Falafels). Ce qui est vrai et vérifié : les 12 têtes sont 12 articles distincts.
- `src/app/api/dashboard/loyalty/rule/route.ts:21-22` — « refusé s'il existe au moins une commande `new` » : seulement si elle a moins de 24 h (`PENDING_MAX_AGE_MS`). Le commentaire de corps L123-128 dit juste ; l'en-tête, qu'on lit en survol, dit faux.
- `src/app/api/rialto/loyalty/lookup/route.ts:239-241` — « le client ne compare plus jamais rien à `stamps_required` » : `FideliteSection.tsx:378` le fait encore en repli. Inoffensif, mais autorise la prochaine session à retirer `reward_available` du payload.
- `src/app/api/rialto/loyalty/verify-review/route.ts:34` — `once` = « un seul claim à vie » : `expires_at` est plafonné à 365 j (L241-243) ; au 366ᵉ jour on peut re-claim. C'est « un an ».
- `src/lib/orderAccess.ts:19-23` — « vérifier le jeton AVANT la moindre requête base » : faux sur la surface la plus sollicitée, `orders/[id]/route.ts` (SELECT L26-32 puis vérif L48-56), pollée toutes les 15 s.
- `src/app/api/rialto/loyalty/signup/route.ts:12-13` — alphabet sans caractères ambigus : vrai sur la boucle, faux sur le repli L32 (`Date.now().toString(36)`), qui peut contenir 0 et 1 et n'est jamais confronté à `customer_cards.short_code`.
- `src/app/api/rialto/loyalty/signup/route.ts:37` — « non-bloquant » : l'appel est AWAITÉ (L389) ; la latence Brevo et le retry expéditeur sont dans le temps de réponse. Vrai seulement au sens « ne jette pas ».
- `src/components/brand/RialtoLogo.tsx:83` — « toujours cliquable » : `hidden md:inline-flex` L95, donc invisible sous 768 px — sur un projet mobile-first, le cas le plus fréquent. Contredit par le commentaire L87-90.
- `src/app/api/dashboard/lottery/draw/route.ts:172-173` — « on évite toute concurrence d'insertion » : la boucle ne sérialise que l'intérieur d'une requête ; le verrou réel (`UNIQUE(lottery_id, month)`) n'est pris qu'à L207, après l'insertion des tickets. Le fichier admet le résidu L204-206.
- `src/app/api/dashboard/push/send/route.ts:21` — « is_active=false + `failure_count`+1 » : l'UPDATE ne pose que `is_active` et `last_error_at`. `failure_count` n'est incrémenté nulle part dans le dépôt (initialisé à 0 à `push/subscribe/route.ts:84`, reste à 0 à vie).

### M4 — « La garde n'est pas là où la phrase la place » — 5 cas (2 majeures)
Le mécanisme est nommé, mais ce n'est pas lui qui tient la propriété — ou il ne la tient pas du tout.
- **M-6** (`cartKey` ne couvre pas les options) · **M-7** (garde P4 en tête, pas dans le dispatch).
- `src/components/loyalty/StampRow.tsx:34-36` — « le plancher zéro est garanti EN BASE (jamais ici) » : il y a bien un plancher ici, `Math.max(0, currentStamps)` L52, qui alimente pastilles et texte. Le composant ne peut pas afficher « −1 tampon ». Le second symptôme (« Encore 11 tampons ») est bien chez l'appelant ; la phrase attribue les deux au même endroit.
- `src/lib/orderAccess.ts:57-59` — « jamais fabriquer une URL sans jeton » : le seul appelant, `buildConfirmationUrl` L116-126, rend l'URL nue et l'assume L123. Deux règles contradictoires à 60 lignes d'écart dans le même fichier.
- `db/fidelite/F0_fidelite_v2.sql:43-46` — « KILLSWITCH : ces migrations sont INERTES » : (a) M6 exécute trois REVOKE à effet immédiat, sans rapport avec le killswitch, et le fichier admet L394 ne pas savoir si un appelant externe subsiste ; (b) le corps de `credit_order_stamps` ne lit jamais `stamp_online_enabled` — l'inertie tient à une garde TypeScript chez l'appelant, descendue en base seulement en F3b:104-120.

### M5 — « La citation elle-même est fausse » — 4 cas (0 majeure)
Le défaut que la règle du 21.08 vise, retourné contre elle : une citation fausse est pire qu'aucune, elle a l'air vérifiée.
- `src/lib/tracking.ts:54-57` — cite `conversionEnAttente()` : n'existe nulle part. La fonction réelle est `hasPendingConversion()` (L219-221), consultée par `PwaRegister.tsx:248` et `:336`. La garantie tient, le nom non.
- `src/app/api/orders/route.ts:396` — cite « ligne 122 » : la colonne est sélectionnée L118 ; L122 est `if (rErr || !restaurant)`. Le fond est exact, la citation pointe 4 lignes à côté.
- `src/lib/useRialtoMember.ts:13` — « expose `{ member, loading, refresh, logout }` » : le hook retourne `{ state, refresh, logout }`. Un appelant qui suit l'en-tête obtient deux `undefined`, et `loading` falsy fait rendre l'état anonyme pendant tout le fetch.
- `src/lib/upsell/scoring.ts:225-226` — « soft penalty si suggestion > 50 % du panier » : le seuil est 60 % (L227). Et « pas de boisson plus chère que le main » annonce une interdiction qui n'existe pas : la pénalité est un −4 uniforme sur tout `dish_role`.

---

## 4. Les lointaines notables (219 au total)

Trois familles couvrent presque tout :

**(a) La garde vit chez l'appelant** — la classe de bug déjà actée. `OffresCarrousel.tsx:12` promet « jamais d'ajout aveugle d'un article à options obligatoires » alors que la garde est chez `MenuClient.tsx:450-464` ; `scanAuth.ts:12-14` promet un fail-fast 500 que quatre routes répètent chacune de leur côté ; `rotation.ts:124` promet une journalisation qui vit dans `menu/page.tsx:61-70` ; `upsell/chemins.ts:105-110` promet une alerte sur ids périmés qui n'existe que par le `console.error` de `index.ts:114-121` ; `delivery/rule.ts:17-20` promet un seuil calculé avant remise alors que la fonction croit son appelant sur parole. Point commun : la promesse est écrite dans le fichier qui, précisément, ne la porte pas.

**(b) La garde vit en base, sans DDL dans le dépôt** — invérifiable en relecture. La contrainte `UNIQUE (business_id, review_author_name, review_time)` sur `google_review_claims`, sur laquelle repose tout l'anti-vol de claim, n'a aucune DDL ici (seule trace : une note « vérifiée en base » dans `RV1b:44`). Idem pour `referrals` deny-all (D4a), pour l'index `uq_review_requests_active` cité nulle part par `reviews/approve`, et pour « le palier est évalué exclusivement dans Postgres » (`loyalty/pending.ts:9-13`) qui ne nomme ni fonction ni fichier.

**(c) La garantie traverse une frontière** — SQL qui garantit un comportement TypeScript, ou l'inverse. `ZL1:92-94` garantit le cliquet d'affichage client (implémenté dans `ConfirmationClient.tsx:557-582`) ; `TR1b:31-35` garantit une règle d'attribution qui vit dans `lib/attribution.ts:100-117` ; `PR1:47-50` grave dans un `COMMENT ON COLUMN` — donc dans la base, illisible depuis le code — une garantie 100 % applicative. Cas extrême : **`CL1_cloture_service.sql:50-56` cite `useCommandesEnDirect.ts` / `STATUTS_AFFICHES`, qui n'existent pas dans ce dépôt** (ils sont dans servato-caisse, jamais nommé) — et dans CE dépôt la phrase serait fausse, `dashboard/orders/route.ts:44-50` fetchant explicitement `completed`/`cancelled` sur 48 h.

**(d) Les garanties tenues par une ABSENCE** — la forme exacte de « PIZZA → SURTOUT PAS DE FRITES ». `phase.ts:19-20` : « les templates `order_preparing`/`order_ready` restent INACTIFS » — vrai parce que les chaînes n'apparaissent nulle part ailleurs que dans ce commentaire. `lot1_rls_tables_clients.sql:7-10` : « 100 % des accès passent par `supabaseService()` » — vrai parce que `supabaseBrowser()` n'est appelé nulle part. `lookup/route.ts:320-323` : « un jeton ne s'émet jamais depuis une route moins authentifiée » — vrai parce qu'il n'y a qu'un émetteur dans tout le dépôt. Trois phrases vraies aujourd'hui, qu'aucune ligne ne défend demain.

Deux mécanismes mal attribués méritent d'être notés à part, parce qu'ils piègent activement : `F7:447` accole « ne s'arme que sur un vrai changement de statut » à `AFTER UPDATE OF status`, alors qu'en Postgres cette clause se déclenche dès que la colonne figure dans le SET — ce qui tient la phrase est la clause WHEN 31 lignes plus bas ; et `upsell/index.ts:203-204` promet la diversité de rôles dans le top 5, que la boucle commentée ne produit pas (elle complète sans contrainte) — la promesse tient au `budget = Math.min(budget, 1)` trente lignes plus bas, qui disparaîtra le jour où le plafond repassera à 2.

---

## 5. Ce que ce balayage apprend

**1. Ces phrases ne naissent presque jamais fausses. Elles le deviennent.** Douze des 38 (dont 7 des 10 majeures) sont datables d'un événement précis : un refactor, une suppression, un recyclage de colonne, une navette non exécutée. Le mensonge n'est pas dans la rédaction, il est dans le fait qu'un changement de code ne déclenche aucune relecture des phrases qui le décrivent. **Trois changements à eux seuls ont orphelin sept phrases.** Corollaire opérationnel : le vrai déclencheur de relecture n'est pas « j'écris un commentaire », c'est « je supprime ou je recycle quelque chose » — et c'est précisément le moment où on ne relit rien.

**2. L'en-tête est la partie qu'on ne repasse jamais, et c'est la seule qu'on lit en survol.** Dans au moins six cas, le corps du fichier dit vrai et l'en-tête dit faux, à 15-60 lignes d'écart : `orderAccess.ts` (L19 vs L123), `confirm-delivered` (L90 vs L45-57), `tracking.ts` (L300 vs L325), `loyalty/rule` (en-tête vs L123-128), `RialtoLogo` (L83 vs L87-90), `ZL1` (L79 vs L57). Un fichier qui se contredit lui-même n'est pas un fichier ambigu : c'est un fichier dont l'en-tête est un fossile. La date d'écriture d'un en-tête vaut plus que son contenu.

**3. Le quantificateur absolu est le marqueur de risque.** 17 des 38 fausses sont fausses uniquement par un chemin oublié. « Jamais » et « toujours » sont des affirmations sur TOUS les chemins : leur fausseté ne se voit qu'au grep exhaustif, jamais à la lecture locale. Une phrase nuancée est presque toujours vraie ; une phrase en majuscules l'est deux fois moins. Le cas le plus instructif est `tracking.ts:325` — « TOUT APPEL À META PASSE PAR ICI, ET NULLE PART AILLEURS », vrai pour les 30 000 lignes du reste du dépôt, faux à cause d'un appel situé 145 lignes plus bas dans le même fichier. L'auteur a greppé le dépôt et pas son propre fichier.

**4. Le chiffre écrit en prose est une seconde source de vérité, donc une source de mensonge.** 50 % contre 60 %, « 5 chemins » pour 4 (avec 6 énumérés), « à vie » pour 365 jours, « au moins une commande `new` » pour « de moins de 24 h », les seuils ETA dupliqués trois fois. Chaque nombre recopié dans une phrase dérive indépendamment de la constante qu'il décrit.

**5. Une citation fausse est pire qu'une citation absente.** Les quatre cas M5 (`conversionEnAttente()` qui n'existe pas, « ligne 122 » qui pointe à côté, `{member, loading}` qui n'est pas la signature) ont tous l'apparence de la conformité à la règle du 21.08. Ils passeraient un audit automatique. La règle n'a de valeur que si la citation est relue depuis le fichier cité, pas depuis le souvenir.

**6. Les commentaires qui sortent du dépôt sont les plus dangereux.** `COMMENT ON FUNCTION`, `COMMENT ON COLUMN`, `COMMENT ON CONSTRAINT` : ils partent en base, deviennent la seule documentation qu'une session future lira depuis psql, sont invisibles au grep du code, et perdent le contexte du fichier qui les entourait. Quatre en portent aujourd'hui une affirmation fausse ou périmée (F7, TAP1, PR1, F3b). Une phrase de sûreté gravée en base devrait être tenue à un standard plus élevé qu'un commentaire de code, pas plus bas.

**7. La classe la plus coûteuse n'est pas l'imprécision, c'est l'inversion du sens sûr.** Deux formes, symétriques : une phrase de sécurité qui décrit un trou déjà bouché (`confirm-delivered`, la fuite Meta) invite le lecteur suivant à retirer la garde qui l'a bouché ; une phrase d'arrêt périmée (`ZL1`, `LS0`) interdit une action légitime ou, pire, décrit un rollback qui casserait la prod. Ce sont exactement les phrases écrites en majuscules avec un ⚠️ — celles qu'on croit les plus fiables.

**8. Enfin : 219 phrases vraies mais lointaines, contre 38 fausses.** La règle du 21.08 ne coûte pas 38 corrections, elle en coûte 257 — et son bénéfice principal n'est pas de corriger les fausses, c'est que **la moitié des 38 auraient été impossibles à écrire** si l'auteur avait dû ouvrir le fichier et compter la ligne au moment de la rédaction. `cartKey` sans les options, `failure_count` jamais incrémenté, la garde P4 en tête au lieu du dispatch, `plancherStatut` non appelé dans une branche : dans chacun de ces cas, l'obligation de citer aurait fait voir le code.
