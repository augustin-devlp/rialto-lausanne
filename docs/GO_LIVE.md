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

- [ ] **Roue e2e** : disponible SAMEDI/DIMANCHE uniquement — spin réel →
      code `spin_wheel` en base → SMS `wheel_prize_code` reçu → code
      validé au checkout. (Premier créneau : samedi 08.08 ; un claim
      d'avis expiré devra être recréé le jour J.)
- [ ] **Push** : ≥ 1 appareil abonné (`push_subscriptions` — 0 au 03.08),
      envoi depuis le composer `/dashboard/push` (PIN Augustin), preuve =
      réception + ligne `push_logs`.
- [ ] Anniversaire : vérifié par le cron du 04.08 (client test fêté) —
      reporter ici le bilan.

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

## Hors périmètre G (backlog v1.1, ne pas ouvrir pendant le gel)

- Milestone fidélité (« plus que X CHF pour un tampon ») — re-généraliser
  milestones.ts (replié le 03.08).
- `referral_claim_reward` absent de la base (fallback code en dur).
- i18n : chaînes FR de `dictionaries.ts` tutoyées mais MORTES (aucun
  consommateur) — à vouvoyer le jour où l'i18n est câblée.
- Branche VIP anniversaire (`birthday_wish_vip`) — attend des paliers
  dans `vip_tiers` (table vide).
