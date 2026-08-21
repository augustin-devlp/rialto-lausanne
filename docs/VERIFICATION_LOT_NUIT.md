# À vérifier toi-même — état au 21.08.2026 (soir)

Coche au fur et à mesure. **PREUVE FAITE** = déjà vérifié en production par
moi ; le risque n'est pas là. Classé par risque, pas par numéro d'item.

---

## 1. Le jeton d'accès aux commandes

Le secret est posé, et **le chemin légitime marche** — c'est ce que tu
demandais.

- [x] **PREUVE FAITE** — `/confirmation/R-2026-052` **sans rien** → 404.
- [x] **PREUVE FAITE** — avec son jeton → **200**, la page s'affiche.
- [x] **PREUVE FAITE** — `reorder` : 404 sans, **200 avec** (panier rendu).
- [x] **PREUVE FAITE** — `GET /api/orders/[id]` : 404 sans, **200 avec**.
- [x] **PREUVE FAITE** — `confirm-delivered` : 404 sans ; avec le jeton, la
      garde passe et c'est la règle d'âge qui refuse (410 « trop tard »).
- [x] **PREUVE FAITE** — **étanchéité croisée** : le jeton de la commande
      052 n'ouvre PAS la 051, et réciproquement.
- [x] **PREUVE FAITE** — énumérer R-2026-045 à 052 ne rend plus **aucune**
      donnée client.

**À faire toi-même, une seule fois :**

- [ ] Passe une commande de bout en bout. Après validation tu dois arriver
      sur ton suivi (l'URL porte `?t=…`). Un 404 ici voudrait dire que le
      secret manque en Preview.
- [ ] Ouvre le lien « Suivre ma commande » de l'email reçu.
- [ ] Dans « Mes commandes » : déplie, puis « Suivre ma commande », puis
      « Recommander en 1 clic ». Les deux doivent marcher.

**Toujours ouvert, et c'est ta décision :**
`/api/rialto/loyalty/lookup?phone=…` rend le profil client complet à qui
essaie des numéros. Le jeton ne la ferme pas. Idem
`referrals/stats?customer_id=`.

## 2. Les carrousels — 2 par jour

- [x] **PREUVE FAITE** — exactement **2 rails** affichés, dans le bon ordre
      (aujourd'hui : « À partager à plusieurs » puis « Fromage et crème »).
- [x] **PREUVE FAITE** — `/menu` est en `force-dynamic` : le rail ne peut
      pas se figer sur celui de la veille.

- [ ] **Demain matin, regarde `/menu`.** La paire doit avoir changé — et
      changé **à 5 h**, pas à minuit.
- [ ] **À TRANCHER :** le cycle démarre aujourd'hui sur la paire **J5**,
      pas J1. C'est arbitraire (l'index vient du numéro de jour absolu). Si
      tu veux que J1 tombe un jour précis — le 01.09, par exemple — c'est
      un décalage d'une ligne. Dis-le-moi.

## 3. Livraison seulement

- [ ] Commande depuis un NPA **hors zone** : le message ne doit plus dire
      « optez pour le retrait en magasin » (ce service n'existe pas) mais
      donner le téléphone du restaurant.
- [ ] Ouvre le tiroir panier : le badge doit dire « Livraison », jamais
      « Retrait », **même une fraction de seconde au chargement**.
- [ ] Vérifie que l'option **« Planifié »** du checkout marche toujours.
      C'est le piège que j'ai évité : `requested_pickup_time` n'est PAS du
      retrait, c'est le créneau de livraison sur un champ mal nommé.

**Bloqué sur toi :** la colonne en base et la caisse. Voir
[NAVETTE_B1_RETRAIT.md](NAVETTE_B1_RETRAIT.md). **La caisse bouge en
premier, toujours** — elle n'a pas d'OTA, un correctif s'y réinstalle à la
main sur la Sunmi.

## 4. L'upsell

- [x] **PREUVE FAITE** — pizza seule → **Coca 0.5l** (P3).
- [x] **PREUVE FAITE** — pizza + coca → **Salade mêlée** (P4). **Jamais de
      frites avec une pizza.**
- [x] **PREUVE FAITE** — 3 pizzas → **Coca 1.5l** (mode tablée).
- [x] **PREUVE FAITE** — Pizza à la turca + coca → **Feuilles de vigne**
      (le signal anatolien l'emporte sur « c'est une pizza »).
- [x] **PREUVE FAITE** — repas complet → **silence**.

- [ ] **À TRANCHER — le mode tablée se heurte au seuil de silence.** Le
      moteur se tait au-dessus de **80 CHF** de panier. Or 3 plats à 29 CHF
      font déjà 87. Le mode le plus rentable ne se déclenche donc que sur
      les tablées les moins chères. Monter le seuil ? L'ignorer en mode
      tablée ? C'est ton arbitrage.
- [ ] **À TRANCHER — le Tiramisu est marqué alcoolisé en base**, donc
      éliminé par le premier filtre. Ton chemin dessert serait mort en
      silence. Vrai ou erreur de saisie ?
- [ ] **À TRANCHER — les hamburgers.** Ta table dit « → Frites ». Ils
      portent déjà `fries_included`. Je n'ai rien implémenté pour eux.

Le reste des écarts spec/base est dans
[UPSELL_MOTEUR.md](UPSELL_MOTEUR.md), dont : « 33 pizzas à 25 » = 31 à 25
et 2 à 22 · « 10 pâtes » = 9 · la formule combo n'est pas « 28.50 vs 28 »
mais « économie = 0.50 ».

## 5. Les SMS

- [x] **PREUVE FAITE** — 16 tests : `ı`, `đ`, `Đ`, `ł`, `Ł` sont
      translittérés ; l'albanais et le portugais étaient déjà propres.
- [ ] Rien à vérifier à l'œil. Surveille juste tes logs Vercel : un
      avertissement `[sms]` signalera tout caractère qu'on ne sait pas
      encore translittérer, **avant** que ça n'apparaisse sur une facture.

---

## Rappels permanents

- **La livraison offerte est activée.** Si tu reviens en arrière sur le
  code, **coupe le toggle AVANT** — sinon la livraison devient gratuite sur
  100 % des commandes.
- **`NEXT_PUBLIC_RIALTO_BASE_URL`** doit valoir la même chose que
  `NEXT_PUBLIC_SITE_URL`. C'est la **deuxième** fabrique d'URL (les liens de
  carte de fidélité). N'en poser qu'une les fera diverger le jour du vrai
  domaine.
- **Expéditeur email** : encore `noreply@stampify.ch`. À changer au go-live.
- **Jeudi** : F7 puis CL1, sur ton signal.
