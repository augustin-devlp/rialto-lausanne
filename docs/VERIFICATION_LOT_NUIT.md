# À vérifier toi-même — lot de nuit du 21.08.2026

Écran par écran. Coche au fur et à mesure. Ce qui est marqué **PREUVE
FAITE** a déjà été vérifié en production par moi ; relis-le quand même si
tu veux, mais ce n'est pas là que le risque se trouve.

L'ordre ci-dessous est celui du risque, pas celui des items.

---

## 1. 🔴 EN PREMIER — la page de suivi expose des données clients

**URL : `/confirmation/<numéro>` — ouvre-la en navigation privée, sans être connecté.**

Tu verras la commande de quelqu'un d'autre : nom, adresse, panier,
montant. Les numéros se suivent (`R-2026-050`, `051`, `052`…), donc on
peut les parcourir un par un.

- [ ] Ouvre `/confirmation/R-2026-050` en navigation privée. Tu ne devrais
      pas pouvoir voir cette commande, et pourtant tu la vois.
- [ ] Décide : est-ce qu'on ferme la page avant le go-live ?

**Ce que j'ai déjà retiré** (déployé) : le code d'entrée d'immeuble,
l'étage/porte et les consignes de livraison. Ils partaient dans la page
alors qu'ils n'y étaient même pas affichés.
**Ce que je n'ai pas retiré, et pourquoi** : le numéro de téléphone sert à
retrouver la carte de fidélité sur cette page. L'enlever casserait la
fidélité. Il faut un vrai verrou sur la page — c'est ton arbitrage, pas
une correction que je pouvais faire seul.

---

## 2. L'écran Menu du dashboard (le nouveau)

**URL : `/dashboard/menu`, sur ton téléphone, pas sur l'ordinateur.**

- [ ] Fais défiler la liste. La recherche et les trois filtres doivent
      **rester visibles** en haut. (Ils passaient sous l'en-tête ; corrigé.)
- [ ] Retire un plat. Va sur `/menu` dans un autre onglet : le plat doit
      être grisé, **et il doit avoir disparu des carrousels du haut**.
      ⚠️ **C'est le test le plus important de la nuit** : les carrousels
      vendaient les plats épuisés avec un bouton « + » actif. C'était ma
      régression. Je l'ai corrigée mais je n'ai **pas pu la tester** — il
      aurait fallu écrire en base, et tu me l'as interdit.
- [ ] Ouvre la fiche du plat retiré (`/menu/<le-plat>`). Le bouton
      « Ajouter » doit être inactif. ⚠️ **Attends jusqu'à 2 minutes** :
      cette page est en cache. La grille, elle, est instantanée.
- [ ] Remets-le. Puis « Tout remettre en vente » : le compteur doit
      retomber à zéro.
- [ ] Coupe le wifi de ton téléphone, tape un interrupteur. Tu dois voir
      un message, et l'interrupteur doit revenir en arrière.

---

## 3. Le suivi de commande (client)

**URL : `/confirmation/<une commande à toi>`**

- [ ] **PREUVE FAITE** : 4 étapes, l'étape « Livrée » a disparu.
- [ ] **PREUVE FAITE** : la dernière étape dit « devrait être arrivée »
      quand c'est l'horloge qui parle, et « est arrivée » seulement si le
      client a tapé le bouton.
- [ ] À relire toi-même : sur une commande **annulée**, le bas de page ne
      doit plus réclamer « Total à régler au livreur » ni afficher
      l'encart « Paiement au livreur ». (Corrigé cette nuit.)

## 4. Mes commandes

**URL : `/mes-commandes`**

- [ ] Déplie une commande **terminée** → doit dire « Total payé ».
- [ ] Déplie une commande **annulée** → doit dire « Montant de la commande
      annulée ». Elle ne doit **jamais** dire « payé » : le client n'a rien
      payé.
- [ ] Déplie une commande **en cours** → « Total à régler au livreur », et
      un bouton **« Suivre ma commande »** bien visible en haut du
      dépliement. (Avant, ce lien disparaissait si le détail échouait à
      charger — le client perdait l'accès au suivi de sa pizza en route.)

## 5. La carte et les 12 carrousels

**URL : `/menu`**

- [ ] **PREUVE FAITE** : les 12 carrousels s'affichent, et les 91 plats
      qu'ils citent existent tous en base (0 orphelin).
- [ ] **PREUVE FAITE** : les 12 plats du carrousel « Sans viande » sont
      tous marqués végétariens en base. La promesse du titre tient.
- [ ] **À TRANCHER — « Le goût de la mer » a 13 plats**, les 11 autres en
      ont 12. Volontaire ou coquille ?
- [ ] **À TRANCHER — trois alcools** dans « Les saveurs anatoliennes » :
      Çankaya blanc, Yakut rouge, Efes draft. La règle du projet dit
      « jamais d'alcool en recommandation ». Un carrousel placé au-dessus
      de la carte est une recommandation, pas un catalogue. À valider ou à
      retirer.
- [ ] **À MESURER — le poids de la page.** 12 carrousels, c'est environ
      2 800 px de défilement avant d'atteindre la carte sur téléphone. Un
      Lighthouse mobile avant le gel serait prudent (objectif > 90).
- [ ] **À RELIRE — le registre des titres.** « Les incontournables »,
      « Envie de fondant », « Le goût de la mer », « Les pizzas
      généreuses » sont imagés. Si ta règle « mots courants, jamais de
      formule littéraire » s'applique aussi ici, il faut les revoir.
      Si ces titres sont de toi, dis-le et je n'y touche plus.

## 6. Ce qui n'a pas bougé, et c'est voulu

- [ ] **PREUVE FAITE** : aucune règle métier n'a été touchée. Les cinq
      fichiers (prix, seuil de gratuité, anneaux de livraison, fidélité,
      route de commande) sont **intacts** au diff.
- [ ] **PREUVE FAITE** : les trois nouvelles routes du dashboard refusent
      tout appel non authentifié (401), y compris avec un identifiant de
      plat valide.
- [ ] **PREUVE FAITE** : la route de détail ne révèle jamais l'existence
      d'une commande. Même code et même corps de réponse pour une commande
      réelle avec mauvais téléphone et pour une commande inexistante.

---

## Pour jeudi — rien de tout ça n'est fait, et rien ne doit l'être avant ton signal

Ordre imposé : **F7** (retrait des tampons), puis **CL1** (clôture
nocturne). Les deux fichiers sont écrits et relus.

- [ ] **À SAVOIR AVANT DE LANCER F7** : les deux clients concernés sont à
      **9 tampons sur 10** — à une pizza gratuite. Après F7 ils
      retomberont à **6** et **7**. Ils le verront. Aucune récompense n'a
      été consommée sur ces cartes, donc la garde protectrice de F7 ne se
      déclenchera pas : le retrait aura bien lieu.
- [ ] Les deux migrations commencent bien par `SET lock_timeout = '5s'`,
      côté migration **et** côté rollback. Vérifié.

## Rappel permanent

La livraison offerte est **activée** en ce moment
(`free_delivery_enabled = true`, offset 15.00). Aujourd'hui les seuils
réels sont 40 / 50 / 60 / 70 CHF selon la zone.

**Si tu dois revenir en arrière sur le code cette semaine, COUPE le
toggle AVANT.** Sinon le 15.00 est relu comme un seuil absolu — et comme
le minimum de commande le plus bas est déjà de 25 CHF, la livraison
deviendrait gratuite sur **100 % des commandes livrées**.
