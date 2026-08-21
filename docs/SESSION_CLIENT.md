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

**Ce que j'ai besoin que tu tranches** : la preuve de possession se fait
par SMS ou par **e-mail** (voir la section dédiée — ta décision de rendre
l'e-mail obligatoire vient d'ouvrir cette seconde voie, moins chère).

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

### Deux façons de prouver la possession — et l'e-mail change la donne

**(a) Un code par SMS.** Prouve la possession du NUMÉRO, qui est la clé du
compte aujourd'hui. C'est la voie la plus directe. Coût : un template SMS
de plus, un envoi par connexion, et un canal à surveiller le soir du
go-live.

**(b) Un lien de connexion par E-MAIL.** ⚠️ Cette voie **n'existait pas
avant le 21.08** : l'e-mail était optionnel, donc inutilisable comme
canal de preuve. Depuis qu'il est **obligatoire au checkout**, tout client
qui a commandé une fois en a un — et il est déjà écrit sur sa fiche.

Ce qu'elle change concrètement :
- **moins cher** : pas de SMS par connexion, on réutilise Brevo qui envoie
  déjà les reçus ;
- **plus simple à saisir** : un lien qu'on clique, pas un code qu'on
  recopie ;
- ⚠️ **elle prouve l'e-mail, pas le numéro.** Ce n'est pas un détail : si
  le compte reste indexé par téléphone, un attaquant qui connaît le numéro
  ne peut plus se connecter — c'est bien l'effet voulu — mais un client
  qui change d'e-mail perd son accès, et il faut un chemin de récupération.
- ⚠️ **elle ne couvre pas les clients d'avant.** Les 5 fiches en base n'ont
  pas d'e-mail. Sans clients réels, la question est théorique aujourd'hui ;
  elle ne le sera plus après le 01.09.

**Ma recommandation : (b), l'e-mail.** Elle coûte moins, elle s'appuie sur
une décision que tu viens déjà de prendre, et elle évite d'ajouter un
canal SMS à surveiller le soir du lancement. Mais c'est **ton arbitrage** :
elle déplace la clé d'identité du téléphone vers l'e-mail, et ça se décide
une fois pour toutes, pas à moitié.

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

**Le SMS** — un septième template, et un canal de plus à surveiller le
soir du go-live. Le module de translittération est déjà en place.

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

1. **Minimisation de `lookup`** — court, sans effet de bord, à condition
   d'avoir vérifié qu'aucune autre route ne rend les mêmes champs.
2. **La session signée** — le socle, puis les six routes, puis les écrans.
3. **La preuve de possession** (SMS ou lien e-mail — à trancher). Sans
   elle, l'étape 2 n'est pas une fermeture, et il ne faut pas l'écrire
   comme si elle l'était.

Le point 3 est celui qu'on est tenté de repousser. C'est aussi le seul
qui répond à la menace décrite en tête de ce document.

---

## Ce que je n'ai PAS fait, et pourquoi

Aucune ligne de code. Tu as demandé un cadrage écrit, et le choix entre
SMS et e-mail change la forme du socle — le coder avant l'arbitrage
reviendrait à le coder deux fois.
