# La session client signée — cadrage

**21.08.2026** · Décision d'Augustin : **c'est LE chantier, et il se fait
AVANT LE GO-LIVE.** Pas « au backlog », pas « avant le 01.09 » : le seuil
est le go-live lui-même.

*Ce document est un cadrage. Aucune ligne de code n'a été écrite.*

---

## En cinq minutes

**Le problème.** Six routes traitent le numéro de téléphone comme un mot de
passe. Ce n'en est pas un : c'est un identifiant.

**La menace.** Pas l'énumération de masse — le **ciblage**. Un ex, un
voisin connaît déjà le numéro et obtient nom, adresse et code d'entrée.

**Ce qu'une session signée règle.** Elle déplace le contrôle de « chaque
requête » vers « une connexion » : on peut journaliser, expirer, révoquer.
Elle rend aussi « Suivre ma commande », retiré le 21.08.

**Ce qu'elle ne règle pas.** Elle prouve la CONTINUITÉ, pas la POSSESSION
du numéro. Si la connexion ne demande rien, celui qui connaît le numéro se
connecte et repart avec tout.

**Le coût.** Un module (patron existant), six routes, quatre écrans, et un
écran de plus dans le parcours de connexion.

**Ce qui casse.** Tous les « connectés » actuels sont déconnectés. Coût nul
aujourd'hui — zéro client réel. Après le go-live, ce serait une
reconnexion forcée pour tout le monde, un soir de service.

**🔴 TRANCHÉ LE 22.08 PAR AUGUSTIN — trois décisions :**

1. **Le canal de preuve est l'E-MAIL**, pas le SMS. Gratuit, aucun canal
   à surveiller le soir du go-live, aucun piège de caractères.
2. **La clé d'identité reste le TÉLÉPHONE.** Le lien e-mail *connecte* à
   un compte identifié par son numéro — il ne le remplace pas. Carte de
   fidélité, `lookup` et `reorder` restent indexés sur le numéro.
3. **Le cas du foyer revient à la conception** : quand une adresse porte
   DEUX comptes, le lien doit proposer de **CHOISIR** — jamais en
   supposer un.

⚠️ **Conséquence directe : ce chantier est BLOQUÉ tant que
`customers_email_unique` n'est pas retiré** (navette
`db/clients/CU1_retrait_index_email.sql`). Voir la section « Ce que les
décisions du 22.08 changent au chiffrage ».

---

## 🔴 La menace n'est pas celle qu'on croit

Ce n'est **pas** l'énumération de masse. C'est le **CIBLAGE**.

Un ex, un voisin, un harceleur **connaît déjà le numéro**. Il n'a rien à
deviner, rien à énumérer, aucun rate limit à contourner. Une requête
suffit, et il obtient :

- le **nom** et le prénom,
- l'**adresse de livraison** complète,
- et, par la route de suivi, le **code d'entrée de l'immeuble** et les
  consignes laissées au livreur.

C'est ça qui rend le sujet grave. Pas le volume — **le fait qu'une seule
personne mal intentionnée, qui a déjà le numéro, obtienne l'adresse et le
moyen d'entrer.**

Toute mesure qui raisonne en débit (limite par IP, throttle, captcha) est
sans effet sur cette menace. Elle ralentit un robot ; elle n'arrête pas
quelqu'un qui fait **une** requête sur **un** numéro qu'il connaît.

Aujourd'hui l'exposition est **nulle** : il n'y a aucun client réel. C'est
exactement pour ça que la fenêtre pour agir est maintenant.

---

## Ce qui est déjà fermé, et ce qui ne l'est pas

**Fermé le 21.08** — la page de suivi et trois routes voisines exigent un
jeton, et ce jeton ne circule plus que par ses vrais canaux : l'e-mail de
confirmation et la redirection après commande. Il n'est plus distribué
par aucune route ouverte.

**Pas fermé** — tout ce qui a pour clé un **numéro de téléphone** :

| Route | Ce qu'elle rend | Auth |
|---|---|---|
| `GET /api/rialto/loyalty/lookup?phone=` | prénom, nom, e-mail, carte, `qr_code_value`, 10 dernières commandes | aucune |
| `GET /api/rialto/orders/<n>/detail?phone=` | lignes et montants d'une commande | téléphone |
| `GET /api/rialto/orders/<n>/reorder?phone=` | panier complet, notes du client | téléphone |
| `GET /api/rialto/referrals/stats?customer_id=` | numéros des filleuls | aucune |
| `POST /api/loyalty-cards/login-by-phone` | connexion | aucun second facteur |
| `POST /api/rialto/loyalty/signup` | **écrase** nom, prénom, e-mail sur un numéro existant | aucune |

**La racine est unique : le numéro de téléphone est traité comme un mot de
passe dans six routes.** Or ce n'est pas un secret — c'est un identifiant.

---

## Ce que la session doit prouver, et ce qu'elle ne peut pas

Une session signée prouve **la continuité** : « c'est le même navigateur
qu'à la connexion ». Elle ne prouve **pas** la possession du numéro.

**Sans code par SMS, la porte d'entrée reste ouverte.** Quelqu'un qui
connaît le numéro se connecte, obtient une session valide, et repart avec
tout. La session déplace le contrôle de « chaque requête » vers « une
connexion » — c'est un progrès réel (on peut journaliser, expirer,
révoquer), mais **ce n'est pas la fermeture** tant que la connexion
elle-même ne demande rien.

**Il faut donc les deux**, et il faut le dire clairement plutôt que de
livrer la session en croyant avoir fermé :

1. **La session signée** — cookie HMAC httpOnly, patron `scanAuth.ts` déjà
   validé sur ce repo.
2. **Une preuve de possession à la connexion.** Sans elle, la session
   n'est qu'un souvenir mieux rangé.

### 🔴 LA DÉCISION DU 22.08 — le canal est l'e-mail

**Pourquoi l'e-mail et pas le SMS** (raisonnement d'Augustin, retenu) :
gratuit, pas de canal supplémentaire à surveiller le soir du lancement,
aucun piège de translittération. Sur un produit à cinq commandes par jour,
ces trois raisons l'emportent.

Cette voie **n'existait pas avant le 21.08** : l'e-mail était optionnel,
donc inutilisable comme canal de preuve. Elle n'est ouverte que parce que
le champ est devenu obligatoire au checkout.

### 🔴 CE QUE LA DÉCISION NE FAIT PAS — la clé d'identité ne bouge PAS

J'avais présenté la voie e-mail comme « elle déplace la clé d'identité du
téléphone vers l'e-mail ». **Augustin a tranché l'inverse, et c'est le bon
appel** : le lien e-mail *connecte* à un compte, il ne l'*identifie* pas.

- La carte de fidélité, `loyalty/lookup` et `reorder` restent indexés sur
  le **numéro**.
- L'e-mail ne devient jamais une clé de lecture. Aucun code ne doit
  chercher un client par son adresse (règle gravée le 22.08 dans
  `CLAUDE.md`).
- Un client qui change d'adresse e-mail ne perd pas son compte : il perd
  seulement ce moyen de connexion, et son numéro reste la vérité.

C'est ce découplage qui rend la décision sûre. Sans lui, changer d'e-mail
aurait effacé un client.

### 🔴 LE CAS DU FOYER — le lien PROPOSE, il ne suppose jamais

Une adresse peut porter **plusieurs comptes** : couple, colocation,
famille. Chacun a son numéro, tous donnent la même adresse.

Le lien de connexion doit donc, à l'arrivée, **lister les comptes portés
par cette adresse et laisser choisir**. Jamais « on prend le premier », ni
« on prend le plus récent » — les deux sont des façons silencieuses de
connecter quelqu'un au mauvais compte, avec l'historique et l'adresse de
livraison de l'autre.

Écran d'arrivée, dans l'esprit :

> **Deux comptes utilisent cette adresse.**
> · Mehmet — 07• ••• •• 89
> · Ana — 07• ••• •• 12

Numéros masqués : la page est atteinte par un lien, on n'y révèle pas un
numéro complet.

⚠️ **CE QU'IL FAUT SAVOIR ET DIRE : partager une adresse e-mail, c'est
partager l'accès.** Qui contrôle la boîte peut ouvrir les deux comptes.
Ce n'est pas un défaut du mécanisme — c'est l'arrangement du foyer
lui-même. Mais ça doit être un choix conscient, pas une surprise.

---

## 🔴 Ce que les décisions du 22.08 changent au chiffrage

### Ce qui DISPARAÎT par rapport à la voie SMS

- Le **7ᵉ template SMS** et sa relecture.
- Le **coût par connexion**.
- **Le canal à surveiller le soir du go-live** — c'était le vrai coût
  caché, et il tombe.
- Tout le **risque de translittération** (GSM-7 / UCS-2, lettres barrées).

### Ce qui S'AJOUTE

- **Un template e-mail** de plus (Brevo est déjà branché, `sendEmail`
  existe et n'a qu'un appelant).
- **Deux routes** : demander le lien, consommer le lien.
- **Un écran de désambiguïsation** — le cas du foyer. C'est la pièce
  nouvelle, et elle n'existait dans aucune des deux versions précédentes
  du chiffrage.

### Ce qui NE COÛTE RIEN, et c'est la bonne nouvelle

**Aucune table, aucune migration pour le jeton.** Le lien peut être
**dérivé en HMAC**, exactement comme le jeton d'accès aux commandes livré
le 21.08 (`src/lib/orderAccess.ts`, patron prouvé en production) :
`HMAC(secret, adresse + horodatage d'expiration)`. Rien à stocker.

⚠️ **Le compromis, dit franchement** : un lien HMAC est **rejouable**
jusqu'à son expiration — il n'est pas à usage unique. Le rendre à usage
unique exigerait une table, donc une migration. **Ma proposition :
expiration à 15 minutes et on accepte le rejeu dans cette fenêtre.**
Quelqu'un qui lit la boîte mail peut de toute façon en redemander un.
C'est ton arbitrage, pas une règle.

### 🔴 LA DÉPENDANCE DURE — ce chantier est bloqué par CU1

Tant que `customers_email_unique` existe :

- deux membres d'un foyer **ne peuvent pas** porter la même adresse ;
- donc l'écran de choix que tu viens de demander **ne peut jamais être
  atteint** ;
- et surtout, le second membre **n'a aucune adresse sur sa fiche** — il ne
  peut donc **jamais se connecter du tout**.

**La session client par e-mail n'est pas livrable avant la migration CU1.**
Ce n'est pas un ordre de préférence, c'est un blocage technique.

### Chiffrage net

Environ **le même nombre de pièces** que la voie SMS, mais des pièces
moins chères, et **zéro nouveau canal externe** à surveiller au
lancement — ce qui était le vrai risque. La pièce en plus, l'écran de
choix, est directement la conséquence de la décision (3).

---

## Ce que ça touche

**Le socle** — un module `sessionClient.ts` sur le modèle de `scanAuth.ts` :
cookie httpOnly signé, vérification timing-safe, fail-fast si le secret
manque. Le patron existe et il a été audité ; on ne réinvente rien.

**Les routes** — les six ci-dessus passent de « téléphone en paramètre » à
« session lue dans le cookie ». Le paramètre `phone` disparaît des URLs,
ce qui règle au passage un problème secondaire : un numéro dans une URL
part dans les logs, le `Referer` et l'historique.

**Les écrans** — quatre au moins : `ConnexionClient` (l'écran de
connexion, qui gagne l'étape du code), `MesCommandesClient`,
`FideliteSection`, `ParrainageClient`. Plus `UpsellPanel`, qui lit
`customer_id`.

**L'e-mail** — un template de plus. ⚠️ Ce paragraphe annonçait « un
septième template SMS » : caduc depuis la décision du 22.08, le canal de
preuve est l'e-mail. Brevo est déjà branché et `sendEmail`
(`src/lib/brevo.ts`) n'a qu'un seul appelant aujourd'hui.

**Le stockage** — `customerSession.ts` est aujourd'hui un `localStorage`
de quatre clés non signées. Il devient un miroir d'affichage ; la vérité
passe dans le cookie.

---

## Ce que ça casse

**Tout client déjà « connecté » est déconnecté** au déploiement. Sans
clients réels, le coût est nul aujourd'hui — après le go-live, ce serait
une reconnexion forcée pour tout le monde, un soir de service.

**Le lien « Suivre ma commande » de « Mes commandes » revient**, et c'est
la session qui le rend possible : une route authentifiée pourra alors
émettre le jeton sans rouvrir le trou qu'on vient de fermer. Ce lien est
retiré depuis le 21.08 précisément faute de source propre.

**Le parcours de connexion s'allonge d'un écran.** C'est le vrai coût
produit, et il est assumé : aujourd'hui la page dit « Pas de mot de passe
à retenir. Votre numéro de téléphone suffit. » — cette phrase devra
changer, et elle décrit exactement le problème.

**Un coût SMS par connexion.** Faible en volume, mais réel.

---

## Un chemin plus court ? Oui, un seul, et il est partiel

**Minimiser la charge utile de `lookup`**, comme tu l'as proposé.

Une route qui sert à retrouver une carte de fidélité n'a besoin que du
**prénom** et du **solde de tampons**. Réduite à ça, la fuite passe de
« profil client complet » à « quelqu'un a une carte » — ce qui
n'intéresse personne.

**⚠️ Mais il faut d'abord vérifier qu'aucune AUTRE route ouverte ne rend
les mêmes données**, sinon on déplace la fuite au lieu de la fermer. C'est
ta consigne, et elle est juste — c'est exactement l'erreur que j'ai faite
avec le jeton. Le balayage est à faire avant de retirer quoi que ce soit.

Ce chemin est **complémentaire**, pas alternatif : il réduit ce qui fuit,
il ne ferme pas la porte. Il a l'avantage d'être court et sans effet de
bord sur le parcours client.

---

## Ordre proposé

0. 🔴 **La migration CU1** (retrait de `customers_email_unique`).
   Bloquante : sans elle, le second membre d'un foyer n'a pas d'adresse sur
   sa fiche et ne peut pas se connecter. Attend le signal d'Augustin.
1. **Minimisation de `lookup`** — court, sans effet de bord, à condition
   d'avoir vérifié qu'aucune autre route ne rend les mêmes champs.
2. **La session signée** — le socle, puis les six routes, puis les écrans.
3. **La preuve de possession — LE LIEN E-MAIL** (tranché le 22.08), avec
   l'écran de choix quand l'adresse porte plusieurs comptes. Sans cette
   étape, l'étape 2 n'est pas une fermeture, et il ne faut pas l'écrire
   comme si elle l'était.

Le point 3 est celui qu'on est tenté de repousser. C'est aussi le seul
qui répond à la menace décrite en tête de ce document.

---

## Ce que je n'ai PAS fait, et pourquoi

Aucune ligne de code. Tu as demandé un cadrage écrit, et le choix entre
SMS et e-mail change la forme du socle — le coder avant l'arbitrage
reviendrait à le coder deux fois.
