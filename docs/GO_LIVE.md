# Checklist LOT G — go-live (gel 25.08, lancement 01.09)

> Créée le 03.08.2026 (GO Augustin, lot de clôture, point 8). Chaque case
> se coche avec une PREUVE (requête, capture, numéro de commande).

## Réglages à (ré)activer au go-live

- [ ] **Loterie : `lotteries.is_active` → true** (désactivée constatée le
      03.08 — la promesse « 1 commande = 1 participation » est affichée
      sur le site). PREUVE : la première vraie commande crée une ligne
      `lottery_participants` du mois courant.
- [ ] Seuil livraison offerte : montant validé par Mehmet + toggle
      (`/dashboard/livraison`) — sinon reste OFF, c'est un choix.
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
      test. Ordre de purge (enfants d'abord, FK) :
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

## Moteur de statuts (livré 08.08 — QA fenêtre Studio)

- [ ] QA des phases intermédiaires : Augustin bascule une commande test
      `new` → `accepted` dans Supabase Studio (le trigger horodate) et la
      page /confirmation doit dérouler TOUTE SEULE : Confirmée (≈2 min) →
      En préparation (fenêtre cuisine) → En livraison → Livrée à l'ETA —
      tick 30 s, zéro écriture. Vérifier aussi la fourchette live du
      checkout (« 35–45 min ») et le repli figé (« ~40 min ») hors ligne.
- [ ] Recalibrage septembre : toutes les constantes du moteur vivent dans
      `src/lib/eta/constants.ts` (file +4/cmd cap 20, aller-retour
      livreur, rush, plafond « moins d'1h ») — les ajuster sur les
      données réelles des premières semaines.

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
- [ ] PWA : le toast « Nouvelle version » apparaît sur les appareils
      installés après le premier déploiement post-gel.
- [ ] Emails Brevo : reçu réel sur domaine final (piège Authorised IPs).
- [ ] Import base clients Mehmet : consentement SMS d'abord — sinon ne
      pas importer.

## Question produit ouverte (avant le gel)

- [x] ✅ TRANCHÉ 04.08 : FideliteSection re-routé sur la nouvelle page
      `/rialto-club/fidelite` (nav non-connectés « Ma carte fidélité ») ;
      les 4 autres orphelins (AvisSection, ContactSection, LegalSection,
      FloatingCallButton) SUPPRIMÉS — chacun couvert par un équivalent v2
      vivant.

## Hors périmètre G (backlog v1.1, ne pas ouvrir pendant le gel)

- Milestone fidélité (« plus que X CHF pour un tampon ») — re-généraliser
  milestones.ts (replié le 03.08).
- `referral_claim_reward` absent de la base (fallback code en dur).
- i18n : chaînes FR de `dictionaries.ts` tutoyées mais MORTES (aucun
  consommateur) — à vouvoyer le jour où l'i18n est câblée.
- Branche VIP anniversaire (`birthday_wish_vip`) — attend des paliers
  dans `vip_tiers` (table vide).
