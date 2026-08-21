# Les langues — analyse (21.08.2026)

**Périmètre : cinq langues — FR (référence), EN, DE, IT, TR.**
**L'arabe est HORS de ce lot** (le droite-à-gauche double le chantier) :
lot séparé, en dernier.

**Règle qui commande tout :** on ne livre jamais une langue à moitié. Tant
qu'une langue n'est pas complète et relue, elle reste « bientôt » et
inactive dans le sélecteur. C'est la leçon du sélecteur qui ne faisait rien.

*Aucun code n'a été écrit pour ce sujet. Ce document est l'analyse
demandée ; il attend un arbitrage avant toute ligne.*

---

## 🔴 À TRANCHER EN PREMIER — un bug qui coûte de l'argent AUJOURD'HUI

Découvert en analysant le piège des SMS turcs, mais **il ne concerne pas
les langues : il frappe déjà, en français.**

`translittereGsm7` (`src/lib/smsTemplates.ts`) retire les accents des
valeurs injectées dans les SMS, pour rester dans l'alphabet GSM-7 (160
caractères par segment). Elle traite `é`, `à`, `ç`, `ğ`, `ş`, `İ`…
**mais pas `ı`** — le « i sans point » turc (U+0131).

Pourquoi elle le rate : la fonction décompose les caractères accentués
puis retire le signe. Or `ı` n'est pas un « i avec un signe » : c'est une
lettre à part entière, sans décomposition. Rien à retirer, donc rien à
faire — elle le laisse passer.

Vérifié caractère par caractère, et `ı` est le **seul** trou :

| Caractère | Décomposition | Ce que la fonction en fait |
|---|---|---|
| **`ı`** (i sans point) | **aucune** | **`ı` — passe intact ❌** |
| `İ` (I avec point) | `0049 0307` | `I` ✅ |
| `ğ` | `0067 0306` | `g` ✅ |
| `ş` | `0073 0327` | `s` ✅ |
| `ç` `ö` `ü` | décomposables | `c` `o` `u` ✅ |

**Conséquence, dès maintenant :** un seul `ı` fait basculer le SMS entier
en UCS-2, où la limite tombe de 160 à **70 caractères**. Une cliente qui
s'appelle **Işık** ou **Çağrı** fait donc coûter ses SMS **deux à trois
fois plus cher**, en français, aujourd'hui. Et `ı` est le caractère turc
le plus courant : il est dans presque tous les suffixes.

**Le correctif tient en UNE ligne** — mapper `ı`→`i`, et rien d'autre :
tous les autres caractères turcs sont déjà couverts. Je ne l'ai pas
écrit : tu as demandé « aucun code » sur ce sujet. Dis-moi et c'est fait
en deux minutes.

**Second constat gratuit, lui aussi actuel :** les émojis coûtent déjà
cher. `birthday_wish` (🎂 🍕) part en **3 segments** au lieu d'un, en
français, sur le SMS le plus envoyé en volume marketing. `referral_success`
(🎉) en coûte 2. À eux deux, ils représentent l'essentiel du surcoût SMS
actuel — plus que le turc n'en coûtera jamais.

---

## a. L'état réel — la doc ment à moitié

« Catalogue 121 plats, 4 langues » : **121 est vrai. 4 langues est faux, à
zéro pour cent.**

**En base :** `menu_items` a 52 colonnes, **aucune traduction**. Pas de
`name_en`, pas de `description_de`. `menu_categories` : 6 colonnes, aucune
traduction. Aucune table de traduction n'existe (39 tables inspectées).

Volume texte réel du catalogue :

| Champ | Rempli | Volume FR |
|---|---|---|
| `name` | 121 / 121 | 2 228 caractères |
| `description` | 96 / 121 | 3 855 caractères |
| **`description_long`** | **121 / 121** | **96 539 caractères** |
| `menu_categories.name` | 13 / 13 | 13 libellés |

**Le vrai poids est `description_long` : 96 % du volume texte.** C'est lui
qui décide si le chantier « descriptions » est petit ou énorme.

**Bonne nouvelle isolée : les allergènes sont déjà indépendants de la
langue.** Ils sont stockés en codes européens (`gluten`, `milk`,
`sulphites`… 8 codes utilisés). Seuls les libellés sont à traduire, pas la
donnée.

**Côté interface :** `src/i18n/dictionaries.ts` existe déjà — 4 langues,
7 namespaces, 53 clés, 212 chaînes traduites. La plomberie est même
partiellement branchée : `I18nProvider` est monté dans le gabarit racine,
et `useT()` est appelé par le sélecteur de langue et le menu hamburger.

**Mais aucun texte ne passe par le dictionnaire.** Ces deux composants ne
prennent de `useT()` que `locale` et `setLocale` — l'état de la langue,
pas la traduction. Recherche faite sur tout `src` : **zéro appel de
`t()`**. Les 212 chaînes traduites ne sont donc jamais lues, et les
textes sont écrits en dur dans les composants — environ **698 chaînes**
à extraire.

Autrement dit : le sélecteur de langue mémorise bien un choix, et ce
choix ne change rien à l'écran. Le dictionnaire et le tuyau existent ;
c'est le raccordement final qui manque, pas le vocabulaire.

## b. Où vivent les traductions

**Interface → fichiers.** `dictionaries.ts` existe, il suffit de
l'étendre et de le brancher. Pas de base, pas de migration : ces textes
changent avec le code, ils doivent voyager avec lui.

**Contenu (plats, catégories) → base, et cela demande une migration.**
Deux formes possibles :

- **colonnes** (`name_en`, `name_de`…) : simple, mais 5 colonnes par champ
  traduit et une migration à chaque langue ajoutée ;
- **table de traduction** (`menu_item_translations(item_id, locale, name,
  description)`) : une seule migration pour toutes les langues à venir,
  requête un peu plus lourde.

**Ma recommandation : la table.** L'arabe viendra, et peut-être une
sixième langue ; avec des colonnes, chaque ajout serait une navette DDL de
plus. La table se seed en une fois et ne bouge plus.

## c. Quand une traduction manque → le français, jamais du vide

Trois garde-fous, à trois niveaux :

1. **À la compilation.** Le type du dictionnaire dérive du français : une
   langue à qui il manque une clé ne compile pas. C'est ce qui rend
   « une langue complète à la fois » quasi obligatoire — et c'est une
   bonne chose.
2. **En base.** Un `COALESCE(traduction, français)` dans chaque lecture :
   un plat sans traduction s'affiche en français, jamais vide.
3. **À l'exécution.** `t()` renvoie le texte français si la clé manque, et
   **jamais la clé technique** — un `menu.addToCart` affiché à l'écran est
   le pire résultat possible. Un test parcourt toutes les clés et échoue
   si une valeur est vide ou identique à la clé.

## d. Comment la langue est choisie — et l'URL

**Aujourd'hui :** la langue est mémorisée dans le navigateur
(`localStorage`), détectée depuis les préférences au premier passage.
**L'adresse des pages ne change jamais.**

**C'est le point qui décide de tout le reste**, et l'état SEO tranche :

- il n'y a **ni `sitemap.xml`, ni `robots.txt`** ;
- **aucun `hreflang`**, aucun canonical, pas de `metadataBase` ;
- `<html lang="fr">` est **écrit en dur** dans le gabarit racine.

Donc : si l'adresse ne change pas, **Google ne verra jamais les quatre
autres langues**. Elles ne serviront qu'aux visiteurs déjà venus. Un
Turcophone de Lausanne qui cherche « pizza teslimat Lausanne » ne
trouvera rien.

**Ma recommandation : oui, l'adresse doit porter la langue** (`/en/menu`,
`/de/menu`…), avec le français à la racine pour ne casser aucun lien
existant. C'est le seul moyen que les langues servent à conquérir des
clients et pas seulement à en fidéliser. Mais c'est le choix le plus
coûteux à revenir sur ses pas : il doit être fait **avant** la première
ligne de code.

## e. Qui traduit — et où une erreur ferait mal

Ta position (« une traduction automatique relue vaut mieux qu'une
absence, sauf sur quatre points ») est applicable, et **le volume à faire
relire par un humain est faible** :

| Sujet | Volume à relire | Pourquoi c'est critique |
|---|---|---|
| **Allergènes** | 14 libellés + 3 avertissements | Un allergène mal traduit est un risque sanitaire, pas une faute de style |
| **Prix** | ~25-30 phrases (minimum de commande, frais, seuil de gratuité) | Les nombres ne changent pas ; ce sont les phrases autour qui engagent |
| **Conditions de vente** | 1 page (~96 lignes) | Document contractuel |
| **Mentions légales** | 1 page | Document légal |

Soit environ **50 chaînes + 2 pages par langue**. C'est relisable par un
locuteur en une heure. Le reste du site (les ~650 autres chaînes) peut
partir en traduction automatique relue.

**Un piège de fond, pas de traduction :** le format des prix. `47.50 CHF`
est la convention suisse-française ; en allemand suisse on écrit `CHF
47.50`, devise devant. Ça ne bloque pas la compréhension, mais c'est le
détail qui fait « site traduit à la machine ».

## f. Le découpage — ton intuition est confirmée, avec un amendement

Les étapes sont livrables et vérifiables séparément, et les langues
s'activent **une par une**.

**Étape 0 — les trois décisions d'architecture, avant toute ligne :**
l'adresse porte-t-elle la langue ? colonnes ou table ? Ces choix sont
coûteux à revenir. *Aucun code.*

**Étape 1 — l'ossature, en français seul.** Brancher `t()` sur les ~698
chaînes, namespace par namespace. Dédoublonner les deux tables
d'allergènes. Séparer « les langues qui existent » de « les langues
activées » — le sélecteur ne montre que le français. Corriger le `lang` du
gabarit.
**Livrable : le site est identique à l'œil, mais tout passe par le
dictionnaire.** C'est la seule étape qui pourrait viser le gel du 25.08.

**Étape 2 — la migration base + le repli français.** La table de
traduction existe, les 121 plats restent en français.
**Livrable : rien ne change à l'écran, la structure est là.**

**Étape 3 — UNE langue complète, l'anglais.** Pourquoi l'anglais plutôt
que le turc, alors que la clientèle est turcophone : **c'est la seule des
quatre que tu peux relire toi-même.** On valide la chaîne complète
(extraction → traduction → relecture → affichage → SMS → email) sur une
langue dont tu jugeras la qualité. Le turc vient juste après, avec un
relecteur.

**Étape 4 — les trois autres**, une par une, chacune activée seulement
quand elle est complète et relue.

**Mon amendement à ton intuition :** l'ossature ne devrait pas être
« français seul » mais « français seul + deux langues au banc d'essai ».
Raison : l'anglais et l'allemand sont dans le dictionnaire depuis des
mois et **n'ont jamais été affichés une seule fois**. On ne sait pas si
les textes tiennent dans les boutons. L'allemand est la langue qui
déborde (« Mindestbestellwert » contre « minimum »). Tester la mise en
page sur une seule langue laisserait passer ces bugs.

## g. Les SMS turcs — la réponse

**Oui, la même solution s'applique — mais elle est aujourd'hui percée.**

Mesures faites sur les 7 templates réellement branchés, contenus lus en
base, variables substituées :

| État | Segments pour un envoi de chacun |
|---|---|
| Français actuel | 11 |
| Turc, sans translittération | 18 |
| Turc, avec la translittération **actuelle** | 16 (elle ne récupère qu'un template sur sept) |
| Turc, avec la translittération **corrigée** (`ı`, `İ`) | **10 — moins que le français actuel** |

**Donc non, un SMS turc ne coûtera pas trois fois plus cher : corrigé, il
coûtera moins cher que le français d'aujourd'hui.** Ce n'est pas une
décision produit à prendre, c'est un bug de deux lignes à réparer.

**Est-ce acceptable linguistiquement ?** Oui. Un lecteur turc lit
« Siparisiniz hazir » sans effort — l'écriture du turc en ASCII a été la
norme des SMS pendant quinze ans, pour cette raison exacte. **Une
exception dure toutefois : les noms propres.** On ne translittère jamais
le nom du client s'il est affiché comme identité (un reçu, un email) —
seulement dans le corps d'un SMS contraint.

**Et les deux templates qui résistent après correction résistent à cause
des émojis, pas du turc.** 🎂 et 🍕 coûtent 2 segments de plus sur
`birthday_wish`, dans toutes les langues. C'est là qu'est l'argent.

## Les trois décisions que j'attends de toi

1. **Le correctif `ı`** — deux lignes, il économise dès aujourd'hui sur
   les prénoms turcs. Je le fais ?
2. **L'adresse porte-t-elle la langue ?** C'est le choix structurant, et
   sans lui les quatre langues ne serviront qu'aux clients déjà venus.
3. **Les descriptions des plats** — ta recommandation était « oui, mais en
   dernier ». Je la confirme, avec une nuance : `description_long` pèse
   96 % du volume. Traduire seulement `name` et `description` (6 000
   caractères) est un petit chantier ; y ajouter `description_long`
   (96 500 caractères) le multiplie par seize. Je propose de traduire
   les deux premiers, et de laisser `description_long` en français avec
   repli — un client qui ouvre la fiche détaillée verra le texte long en
   français, ce qui est mieux qu'une traduction automatique non relue sur
   96 000 caractères.
