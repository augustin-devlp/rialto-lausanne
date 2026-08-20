# Checklist LOT G — go-live (gel 25.08, lancement 01.09)

> Créée le 03.08.2026 (GO Augustin, lot de clôture, point 8). Chaque case
> se coche avec une PREUVE (requête, capture, numéro de commande).

## Réglages à (ré)activer au go-live

- [ ] **Loterie : `lotteries.is_active` → true** (désactivée constatée le
      03.08 — la promesse « 1 commande = 1 participation » est affichée
      sur le site). PREUVE : la première vraie commande crée une ligne
      `lottery_participants` du mois courant.
- [ ] Livraison offerte PAR ZONE (refonte 18-19.08) : offset validé par
      Mehmet (15 posé par ZL1) + toggle (`/dashboard/livraison`) — sinon
      reste OFF, c'est un choix. Pré-requis TOUS remplis avant d'activer :
      ZL1 exécutée ✅ 19.08 (64 zones post-vérifiées) + code refonte en
      prod ✅ (0cab4f8) + quelques heures de renouvellement des bundles.
      🔒 **RÈGLE PERMANENTE (caisse 19.08) : APRÈS ACTIVATION DU TOGGLE,
      COUPER `free_delivery_enabled` AVANT TOUT ROLLBACK DU CODE —
      TOUJOURS.** Un revert du code fait relire l'offset (15) comme SEUIL
      ABSOLU → livraison gratuite sur 100 % des commandes livrées ; si
      l'offset a été changé au dashboard entre-temps, même le rollback
      data de ZL1 ne rattrape pas.
      📌 Dette DDL : ✅ portée par la **navette HY1** (bloc 2,
      db/orders/HY1_hygiene_orders.sql) — en review caisse depuis le 19.08.
- [ ] Fidélité : barème confirmé (tranche 40 CHF actée le 24.07).

## Tests en attente de leur créneau

- [x] **Roue e2e** : ✅ FAIT 17.08 (lundi ajouté temporairement puis
      retiré, `allowed_weekdays` de retour à `[6,7]`) — gate B → claim
      dégradé → spin gagnant « Dessert offert » → SMS `wheel_prize_code`
      REÇU (vouvoyé) → code validé au checkout → spin perdant sans code.
      2 bugs trouvés et fixés : case perdante « Réessayer » générait un
      code (7c742cd) ; SMS fire-and-forget jamais parti en serverless
      (7c742cd) + journalisation `sms_logs` posée (f274619).
      ⚠️ Les JOURS de la roue (`spin_wheels.allowed_weekdays`, ISO
      1=lundi…7=dimanche) sont un réglage **BASE-ONLY : aucun écran
      dashboard ne l'écrit** — toute modification passe par un UPDATE
      en base (c'est pourquoi l'« ajout du lundi » via l'UI du 17.08
      n'avait pas pris : l'écran n'existe pas).
- [x] **Push** : ✅ FAIT 04.08 — 1 abonnement actif en base, envoi
      composer reçu sur le téléphone d'Augustin, ligne `push_logs`
      (recipients 1, sent 1, failed 0).
- [ ] Anniversaire : vérifié par le cron du 04.08 — ⚠️ les crons Vercel
      sont en UTC : « 30 9 * * * » part à 11h30 heure suisse (été), pas
      09h30. Pré-vols du 03.08 : type date_of_birth = `date` ✓, CHECK
      promo_codes.source contient 'birthday' ✓, carte test activée ✓,
      variables du template ⊆ fournies ✓. Reporter ici le bilan.

## Grand ménage des données de test (DERNIÈRE étape avant ouverture)

- [ ] **Inventaire chiffré PUIS purge en une fois, sur GO explicite** —
      ouvrir sur une base 100 % réelle. Identification : téléphones de
      test d'Augustin (+33676549598/99, +41791342996/97 — compléter la
      liste au moment du ménage), commandes `TEST-*` et `R-2026-0xx` de
      test. ⚠️ Dont **R-2026-049 et R-2026-050** (20.08) : commandes de
      preuve du lot « re-dérivation des prix serveur » (POST forgés,
      téléphone +41790000000, montants sains — elles VALIDENT le
      correctif, elles n'ont rien de cassé, mais restent des commandes de
      test à purger). ⚠️ Dont **R-2026-044** (20.08) : commande CHIMÈRE du bug zone
      — `Grand-Rue 54 / NPA 1010 / Morges`, facturée zone Lausanne
      (frais 5, min 25) pour une adresse de Morges (zone D : 12/55) ;
      données incohérentes, à purger impérativement. Ordre de purge
      (enfants d'abord, FK) :
      1. `transactions` (crédits tampons de test — y c. le tampon 042,
         intouchable AVANT le ménage par l'invariant « jamais reprendre »,
         purgé AVEC tout le reste ici)
      2. `order_items` + `order_status_history` des commandes de test
      3. `orders` de test
      4. `lottery_participants` / `spin_entries` / `spin_results` de test
      5. `promo_codes` de test (RIA-TESTF consommé, RIA-QAPCT expiré,
         codes birthday/spin de test) + `google_review_claims` (dégradé)
      6. `sms_logs` / `push_logs` de test — à trancher (historique de coûts)
      7. `customer_cards` puis `customers` de test
      Méthode : script d'INVENTAIRE (counts par table sur les ids de test)
      présenté AVANT toute suppression ; purge par la conversation
      propriétaire du repo ; re-inventaire à zéro en preuve.
      ⚠️ `push_subscriptions` : l'abonnement d'Augustin peut rester
      (pilotage réel du composer).

## Audit de publication (7 points, 19.08 — lot G clôture)

1. [ ] **AUTH EMAIL (OBLIGATOIRE à la bascule domaine)** : authentifier le
       domaine final chez Brevo — SPF + DKIM + DMARC (Brevo → Senders &
       Domains → Authenticate, poser les 3 enregistrements DNS chez le
       registrar, attendre la validation verte) AVANT d'envoyer le premier
       reçu depuis le domaine. Sans ça, les reçus des vrais clients
       partent en spam dès le jour 1 (problème constaté en juillet, jamais
       tracé jusqu'ici). S'ajoute au piège « Authorised IPs » déjà noté.
2. [x] **ALLERGÈNES** ✅ 19.08 : mention légale (« Informations sur les
       allergènes disponibles sur demande — 021 312 64 60 ») posée au menu
       (pied de page) ET au checkout (sous le total). Complète le filtre
       par allergène déjà présent au menu.
3. [ ] **MONITORING** : route de santé ✅ `/api/health` créée 19.08 (teste
       runtime + env + lecture Supabase ; 200 `{"ok":true}` / 503).
       Reste (action Augustin, ~5 min) : créer un monitor gratuit
       (UptimeRobot ou équivalent) → type **HTTP(s) simple** sur
       `https://<domaine>/api/health` (le 503 non-2xx suffit à déclencher
       l'alerte), cadence 5 min, alerte email augustindom999@gmail.com.
       ⚠️ Si monitor de type « Keyword » : keyword EXACT `"ok":true` —
       jamais « ok » seul, présent aussi dans le corps du 503
       (`{"ok":false}`) : le monitor resterait vert base morte
       (relecture 19.08). À re-pointer sur le domaine final à la bascule.
4. [ ] **BACKUP** : vérifier le plan du projet Supabase `ymnhfdkyqbhucxdrnyzq`
       (dashboard → Settings → Billing) : plan **Free = AUCUN backup
       automatique** ; plan Pro = daily backups conservés 7 jours.
       Étape PRÉ-GO-LIVE obligatoire : **export complet** (Dashboard →
       Database → Backups → download, ou `supabase db dump`) archivé hors
       Supabase, re-daté à chaque jalon (gel, jour J).
       Restauration (5 lignes) : 1) créer un projet Supabase vierge ;
       2) `psql $DB_URL < dump.sql` (ou Studio → SQL editor par morceaux) ;
       3) reposer les clés dans les env Vercel (URL + service key) ;
       4) redéployer ; 5) vérifier /api/health + une commande de test.
5. [ ] **BASCULE 301 + SEARCH CONSOLE** : le runbook BASCULE_DOMAINE.md
       couvre la redirection du `.vercel.app` vers le domaine final
       (étape 8 — Vercel redirige automatiquement les anciens domaines du
       projet en 308) ; AJOUTÉ 19.08 : enregistrer le domaine final dans
       **Google Search Console** (propriété Domaine, validation DNS),
       soumettre le sitemap, et vérifier après la bascule qu'aucune
       indexation ne reste sur vercel.app (`site:rialto-lausanne.vercel.app`).
6. [x] **IMPRESSUM** ✅ 19.08 : /mentions-legales porte l'identité de
       l'exploitant (Pizzeria Rialto + adresse + téléphone) ; résidu
       « Stampify (stampify.ch) » remplacé par « Servato » ; date de mise
       à jour rafraîchie. ⚠️ Reste au jour J : remplacer
       « rialto-lausanne.vercel.app » (codé dans la page) par le domaine
       final.
7. [x] **PAIEMENT — DÉCISION ÉCRITE** ✅ 19.08 : la v1 se règle
       **exclusivement à la remise** — espèces ou TWINT au livreur
       (livraison), espèces/TWINT/carte au comptoir (retrait). AUCUN
       paiement en ligne : choix délibéré (zéro PSP, zéro PCI, friction
       moindre au lancement, encaissement direct restaurateur), PAS un
       trou fonctionnel. Réévaluation possible post-v1 sur la base des
       refus constatés (« je voulais payer par carte en ligne »).

## ☑️ Checklist JOUR J (ordre d'exécution, figée 19.08)

1. [ ] **Grand ménage des données de test** (section dédiée ci-dessus :
       inventaire chiffré présenté AVANT, GO explicite, purge en une fois
       dans l'ordre FK, re-inventaire en preuve).
2. [ ] **`restaurants.receipt_email` → l'email du restaurateur** (valeur
       de test actuelle à remplacer — les reçus partent en copie interne).
3. [ ] **Auth email Brevo sur le domaine final** (point 1 de l'audit) —
       AVANT le premier reçu réel.
4. [ ] **Bascule domaine** (runbook BASCULE_DOMAINE.md) : DNS, env
       NEXT_PUBLIC_SITE_URL, beacons Meta/GA4, redirection .vercel.app,
       Search Console + sitemap (point 5 de l'audit).
5. [ ] **URL du domaine final dans les SMS** : compléter les templates en
       base qui doivent porter le lien (`referral_claim_reward` seedé SANS
       URL — l'ancien fallback pointait rialto-lausanne.ch = Just Eat).
6. [ ] **Impressum** : domaine final dans /mentions-legales (point 6).
7. [ ] **`lotteries.is_active` → true** + PREUVE : la première vraie
       commande crée une ligne `lottery_participants` du mois courant.
8. [ ] **UTM réels + ID Google Ads** : convention `utm_source` figée AVANT
       le premier franc de pub ; ID de conversion Google Ads posé dans les
       env ; purchase de contrôle dans Events Manager/GA4 temps réel.
9. [ ] **Bascule du lien « Commander » de la fiche Google** (étape 9 du
       runbook domaine — dernier geste, quand tout le reste est vert).
10. [ ] **Monitor uptime re-pointé** sur le domaine final (point 3).

## 🔴 BLOQUANT GO-LIVE — Planification des commandes (refonte UI 20.08)

- [ ] Le checkout affiche depuis le 20.08 une « Option de livraison :
      Standard / Planifié » (spec refonte Uber Eats). **« Planifié » ne
      planifie RIEN aujourd'hui** : l'heure part dans
      `requested_pickup_time` (champ existant, visible caisse) mais la
      préparation démarre immédiatement et l'ETA reste ancré sur
      l'acceptation — un client qui planifie 20h peut être livré 19h.
      ASSUMÉ ET TEMPORAIRE (décision Augustin 20.08). Le chantier
      « planification réelle » (colonne `scheduled_for` en navette,
      logique caisse, ETA ancré sur le créneau) est OBLIGATOIRE AVANT LE
      GO-LIVE — sinon retirer l'option du checkout avant l'ouverture.

## Moteur de statuts (livré 08.08 — QA fenêtre Studio)

- [ ] QA des phases intermédiaires : Augustin bascule une commande test
      `new` → `accepted` dans Supabase Studio (le trigger horodate) et la
      page /confirmation doit dérouler TOUTE SEULE : Confirmée (≈2 min) →
      En préparation (fenêtre cuisine) → En livraison → Livrée à l'ETA —
      tick 30 s, zéro écriture. Vérifier aussi la fourchette live du
      checkout (« 35–45 min ») et le repli figé (« ~40 min ») hors ligne.
- [ ] Recalibrage septembre : toutes les constantes du moteur vivent dans
      `src/lib/eta/constants.ts` — modèle PAR RESSOURCE (18.08 : paliers
      pizzas, extraction trajet/zone −25, prior rush pondérée, retour
      livreur par zone de course, chevauchement max()). Les ajuster sur
      la vérité terrain du TAP CLIENT (« commande arrivée ? », TAP1
      exécutée le 18.08) — filtres au recalibrage : exclure cancelled,
      exclure les taps implausibles (le serveur ne borne que l'âge, pas
      la phase), distributions plutôt que moyennes (échantillon non
      aléatoire). Réponses du restaurateur aux 5 questions de
      calibration à reporter dans les constantes.
- [ ] BACKLOG sécurité tap (review caisse 18.08) : réévaluation
      OBLIGATOIRE de l'absence d'auth/rate-limit sur
      /api/orders/[id]/confirm-delivered si le tap déclenche un jour un
      effet au-delà de la commande elle-même (SMS, fidélité, dashboard).
      Aujourd'hui : uuid v4 = jeton de capacité, dégât borné à 1
      datapoint + l'affichage de sa propre page.

## Échéances vivantes (état au 13.08 soir)

- [x] Attribution J+1 : 1/1 commandes depuis TR1b attribuées — CLOS.
- [ ] **Cron anniversaire : verdict le 14.08 ~11h35 CH** — DOB test
      seedée au 14.08, CRON_SECRET confirmée posée par Augustin. Attendu :
      code −20 % + SMS +33…599 + ligne sms_logs. Si silence → diagnostic
      (la secret étant posée, la cause est ailleurs).
- [x] **Roue e2e : ✅ FAIT lundi 17.08** (créneau week-end manqué,
      rattrapé par ajout temporaire du lundi — détail section « Tests »).
- [ ] **Fenêtre Studio moteur de statuts** : à faire par Augustin d'ici
      le gel (aucune trace en base au 13.08 — dernière commande = 042 du
      03.08).
- [ ] **Bascule domaine : décision week-end 15-16, Mehmet lundi 17** —
      dossier complet dans docs/BASCULE_DOMAINE.md. ⚠️ rialto-lausanne.ch
      est DÉTENU par Just Eat (DNS takeaway.com, sert leur page de
      commande) — reco : domaine alternatif immédiat + rétrocession en
      parallèle.
- [x] Balayage serveur du 13.08 20h55 : 12 pages 200, auth 401 partout
      (dashboard ×3 + cron), endpoints publics OK (tranche 40 servie,
      seuil livraison OFF, ETA avec rush +10 constaté en direct à 20h53,
      404 cachés), sw.js stampé dernier commit + GET_VERSION. La matrice
      INTERACTIVE complète se rejoue sur le domaine final (ci-dessous).

## QA finale (répéter la matrice des lots sur le domaine final)

- [ ] Bascule domaine rialto-lausanne.ch : NEXT_PUBLIC_SITE_URL, domaines
      autorisés Meta/GA4, re-QA beacons sur le domaine final.
- [ ] Tracking : page_view/funnel/purchase sur une commande réelle ;
      attribution UTM des vraies campagnes (convention utm_source à
      figer AVANT le premier franc de pub).
- [ ] Meta Events Manager : « Track events automatically without code »
      désactivé (bruit SubscribedButtonClick).
- [ ] PWA : mise à jour SILENCIEUSE (refonte 17.08 — plus de toast) :
      après le premier déploiement post-gel, vérifier sur un appareil
      installé que l'app se met à jour toute seule À LA PREMIÈRE
      NAVIGATION. Mécanique : à l'arrivée de la page, GEL transparent
      (pointeur + clavier bloqués) → SKIP_WAITING → reload dès
      l'activation (~100-600 ms) ; le gel tient aussi pendant le fetch
      réseau du reload. Si l'activation dépasse 1,5 s : dégel, on
      renonce — un rechargement de rattrapage peut alors survenir à la
      navigation SUIVANTE (ce n'est PAS un bug). Jamais de gel ni de
      reload à l'arrivée sur /confirmation, ni tant qu'un purchase
      attend le consentement cookies. Test du cas dangereux (DevTools
      réseau Slow 3G, worker en attente) : arriver au checkout, tenter
      de choisir TWINT et soumettre pendant le gel → les taps sont
      absorbés, AUCUNE commande ne part dans le vide ; après la mise à
      jour, le panier et le prefill sont intacts, une seule soumission
      possible.
- [ ] Emails Brevo : reçu réel sur domaine final (piège Authorised IPs).
- [ ] Import base clients Mehmet : consentement SMS d'abord — sinon ne
      pas importer.

## Question produit ouverte (avant le gel)

- [x] ✅ TRANCHÉ 19.08 (Augustin) : les codes parrainage passent de
      `percent 100` sans plafond (« un trou qui offre un panier entier »)
      à **`free_item` « Pizza Marguerite »** — la promesse exacte des
      deux SMS. Corrigé pour le code FILLEUL **et** le code PARRAIN
      (même `basePromo`, même promesse « une Pizza Marguerite offerte »
      dans `referral_success`) ; le lot arrive en note de commande au
      checkout. Codes percent déjà émis en base : aucun (vérifié — seuls
      2 manual/1 birthday/2 spin_wheel existent).
- [x] ✅ TRANCHÉ 04.08 : FideliteSection re-routé sur la nouvelle page
      `/rialto-club/fidelite` (nav non-connectés « Ma carte fidélité ») ;
      les 4 autres orphelins (AvisSection, ContactSection, LegalSection,
      FloatingCallButton) SUPPRIMÉS — chacun couvert par un équivalent v2
      vivant.

## Hors gel — dépend du restaurateur / du terrain (ne rien coder, suivre)

- **Bascule domaine** : choix + achat par Mehmet (dossier
  BASCULE_DOMAINE.md) — déclenche les points 1/4/5/6 du jour J.
- **Credentials Google Business Profile** : flip du gate avis du mode
  déclaratif au mode vérifié (~1-2 sem. annoncées).
- **Import base clients Mehmet** : consentement SMS d'abord, sinon rien.
- **Calibrage ETA** : réponses aux 5 questions + NOMBRE DE LIVREURS
  (critique — DRIVERS=1 assumé) + confirmation 1010/1011 en anneau A.
- **Compteur de taps client au premier vrai service** : des livraisons
  réelles avec 0 tap = le geste n'est pas trouvé (placement/formulation à
  revoir) et le recalibrage ETA n'aura pas sa vérité terrain.
  (`SELECT count(*) FROM orders WHERE customer_confirmed_delivered_at IS NOT NULL`)

## Hors périmètre G (backlog v1.1, ne pas ouvrir pendant le gel)

- Milestone fidélité (« plus que X CHF pour un tampon ») — re-généraliser
  milestones.ts (replié le 03.08).
- ~~`referral_claim_reward` absent de la base~~ → seed porté par la
  navette HY1 (bloc 4), 19.08. Fallback code corrigé (URL Just Eat
  retirée) en attendant l'exécution.
- Purge automatique des click IDs d'attribution (HY1b pose la politique
  24 mois + le DML rejouable ; l'automatisation — greffe au cron
  quotidien — attendra la v1.1, première échéance réelle mi-2028).
- **Navette d'hygiène SUIVANTE (HY2, post-gel — cadré caisse 19.08)** :
  `REVOKE EXECUTE` sur `generate_order_number` pour les rôles publics ;
  le DELETE de compensation du checkout (POST /api/orders, commande dont
  les items n'ont pas pu être écrits) est documenté dans le code comme
  LA seule exception assumée au « jamais de DELETE sur orders ».
- i18n : chaînes FR de `dictionaries.ts` tutoyées mais MORTES (aucun
  consommateur) — à vouvoyer le jour où l'i18n est câblée.
- Branche VIP anniversaire (`birthday_wish_vip`) — attend des paliers
  dans `vip_tiers` (table vide).
