# Table de référence des templates SMS — Rialto

> **Source de vérité pour tout lot qui veut « brancher un SMS ».**
> État constaté et audité le 22.07.2026 (base `ymnhfdkyqbhucxdrnyzq`,
> table `sms_templates`, restaurant `046d930d-…`). 18 templates seedés en
> base + 1 clé active servie depuis le code. **12 sur 18 sont orphelins** :
> sans cette table, un futur lot ne peut pas savoir lesquels sont interdits,
> lesquels attendent leur moteur, et lesquels mentent encore.
>
> Doctrine des canaux (21.07.2026) : **reçus/confirmations = EMAIL uniquement** ;
> le SMS est réservé au **marketing** + aux **4 transactionnels de valeur**
> (le client GAGNE quelque chose : carte, récompense, gain, parrainage).

## Statuts

- **ACTIF** — envoyé aujourd'hui, appelant précis dans le code.
- **ORPHELIN-PRÊT** — seedé pour une fonctionnalité identifiée à venir ;
  travail d'avance, **ne pas supprimer**.
- **ORPHELIN** — aucun appelant, aucun chantier acté ; ne brancher que sur
  décision produit explicite.
- **MORT** — l'appelant a été retiré ou n'a jamais existé ; conservé pour
  l'historique.
- **INTERDIT** — ne JAMAIS brancher (décision contractuelle).

## Les 5 ACTIFS

| Template | Appelant exact | Notes |
|---|---|---|
| `loyalty_card_created` | `src/app/api/rialto/loyalty/signup/route.ts:55` (création de carte) | Vouvoyé le 22.07. Le barème chiffré en a été retiré (piège F4 : chiffres figés). |
| `reward_unlocked` | `src/app/api/scan/credit/route.ts:106` (scan comptoir, carte complète) | Vouvoyé le 22.07. Template DB uniquement, pas de fallback code. |
| `wheel_prize_code` | `src/app/api/rialto/loyalty/spin/route.ts:288` (gain à la roue) | ⚠️ COUPLAGE : « Valable 30 jours » répète `valid_days: 30` de la route (commentaire posé à côté). Changer la durée = corriger les deux. |
| `referral_success` | `src/app/api/cron/reward-referrals/route.ts:201` (SMS parrain) | ⚠️ Corrigé le 22.07 : annonçait « 30 jours » pour des codes générés à **60** (`route.ts:151`). La version EN BASE fait foi. |
| `referral_claim_reward` | `src/app/api/cron/reward-referrals/route.ts:248` (SMS filleul) | ⚠️ **ABSENT de la base** : le cron retombe sur le `defaultContent` de `src/lib/smsTemplates.ts` (`loadTemplate`, fallback `TEMPLATE_META`). Éditer un futur seed en base prendrait le pas ; en attendant, la vérité est dans le code. |

## Les 2 ORPHELINS-PRÊTS — moteur de progression automatique

| Template | Attend | Notes |
|---|---|---|
| `order_preparing` | Moteur de progression auto (chantier à cadrer, session dédiée) | Déjà vouvoyé, prêt à brancher. |
| `order_ready` | Moteur de progression auto | Déjà vouvoyé, prêt à brancher. |

Le moteur (preparing→ready→completed selon charge cuisine, heure, distance)
est le SEUL chantier acté qui doive brancher des SMS de statut.

## Les 3 ORPHELINS-PRÊTS — anniversaire

| Template | Attend | Notes |
|---|---|---|
| `birthday_wish` | Un cron anniversaire (n'existe pas encore) | ⚠️ La page d'inscription du Club **promet déjà** « Offre anniversaire envoyée par SMS » (`JoinClient.tsx`) et la carte demande la date de naissance : promesse affichée, générateur manquant. Tutoie encore. Cite « 7 jours » sans générateur : à valider au branchement. |
| `birthday_offer` | Idem | Tutoie. Cite « 30 jours » sans générateur : à valider au branchement. |
| `birthday_wish_vip` | Idem | Tutoie. |

## Les 6 ORPHELINS — loterie & roue (hors v1 par décision)

| Template | Notes |
|---|---|
| `lottery_new` | Décision 21.07 (D2) : pas de SMS loterie en v1 — l'écran client affiche tout, notification via push (D5) ou SMS manuel. Texte antérieur au design 3 (« Passe commande pour recevoir ton ticket ») : à réécrire si un jour branché. |
| `lottery_result_winner` | Idem — le gagnant voit confettis + code sur son écran. |
| `lottery_result_loser` | Idem. |
| `lottery_ticket_received` | Idem, et **caduc sous le design 3** : les tickets naissent au tirage, pas à l'inscription. |
| `lottery_winner` | Idem. Cite « 30 jours » sans générateur actif. |
| `wheel_available_again` | Réactivation roue : marketing possible (conforme doctrine), aucun chantier acté. Tutoie. |

## Les 2 MORTS

| Template | Raison |
|---|---|
| `order_confirmation` | SMS de confirmation **coupé le 21.07** (doctrine : reçus = email only, commit `e5c10e2`). Son lecteur `getConfirmationTemplate` (`src/lib/smsTemplate.ts`) est du code mort — au backlog de nettoyage (Lot 2). |
| `order_accepted` | **Aucun appelant nulle part** : le site ne le lit pas (grep exhaustif des `template_key` lus), et la conv caisse a prouvé par grep qu'aucun canal SMS n'existe dans son code. Contenu **corrompu en base** (deux messages concaténés, un vouvoyé + un tutoyé) — sans effet puisque jamais envoyé ; ne pas réutiliser tel quel. |

## ⛔ L'INTERDIT

| Template | Interdiction |
|---|---|
| `order_cancelled` | **NE JAMAIS BRANCHER AU FLUX DE REFUS.** Décision contractuelle du **19.07.2026** : aucun SMS de refus/annulation, quel que soit le canal ou le motif. `cancellation_reason` est une donnée INTERNE (visible du restaurateur uniquement). Le template reste seedé mais tout lot qui le raccorderait au refus violerait un engagement client. Contrôle négatif du protocole de test : `sms_logs` inchangé après un refus. |

## Règles pour tout futur lot SMS

1. **Consulter cette table d'abord** — puis la mettre à jour dans le même commit.
2. **Vouvoiement** obligatoire (règle projet) — les orphelins qui tutoient
   doivent être réécrits AVANT branchement, jamais envoyés tels quels.
3. **Aucun chiffre figé** (durée, barème, seuil) sans vérifier son générateur
   dans le code — et poser le commentaire de couplage des deux côtés
   (précédents : `referral_success` 30≠60, `wheel_prize_code`/`valid_days`).
4. **La version EN BASE fait foi** quand elle existe : corriger uniquement le
   `defaultContent` du code ne change rien aux SMS réellement envoyés.
5. Pas de suppression : les orphelins-prêts sont du travail d'avance.
