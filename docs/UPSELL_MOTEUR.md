# Le moteur d'upsell — état, écarts, et ce qui reste bloqué

**21.08.2026** · spec d'Augustin, confrontée à la base.

---

## Livré et testé : P3, P4, P6 (mode), P8

`src/lib/upsell/chemins.ts` — 22 tests, qui passent par le **vrai**
analyseur de panier, pas par une analyse simulée.

Les chemins passent **devant** le scoreur historique ; quand aucun ne
s'applique, le scoreur reprend la main. On ne perd rien de l'existant.
Les chemins **ne filtrent pas** : leurs candidats repassent par
`passesHardFilters`, seul endroit où vivent les gardes dures — c'est ta
règle d'office du 21.08.

Chaque suggestion porte désormais le **chemin qui l'a déclenchée**. Sans
ça, tu saurais dans trois mois que le moteur se trompe, mais jamais sur
quel chemin — donc tu ne pourrais rien corriger.

---

## 🔴 Ce que la base dit, et qui contredit la spec

### 1. Le Tiramisu est INSUGGÉRABLE aujourd'hui

`menu_items.contains_alcohol = true` sur « Tiramisu maison ». Or le tout
**premier filtre dur** du moteur élimine tout article alcoolisé, avant
même le scoring.

Ton chemin P5 nomme le Tiramisu comme suggestion phare du panier italien.
**Ce chemin serait mort en silence** : pas d'erreur, pas de log, zéro
suggestion.

**À trancher :** le tiramisu contient-il vraiment de l'alcool (amaretto,
marsala) ? Si non → corriger la base. Si oui → il sort de P5, et le
panier italien retombe sur autre chose.

### 2. « 33 pizzas à 25 » — 33 pizzas oui, mais **31 à 25.- et 2 à 22.-**

Pizza Marguerite et Pizza à choix sont à **22.00**. Et « Pizza à choix »
peut monter jusqu'à **+5.00** via ses 28 options d'ingrédients.

Ça compte parce que ta formule combo est écrite sur une base de 25.

### 3. « 10 pâtes » — il y en a **9**, toutes à 25.00

### 4. La formule du combo n'est pas « 28.50 vs 28 »

Elle l'est pour six des sept. Pas pour la Lasagne :
**29.00 + 3.50 = 32.50 contre 32.00**.

L'invariant à coder est **« l'économie est de 0.50 »**, jamais « le combo
est à 28 ». Un message codé en dur sur 28.- annoncerait un prix faux de
4 francs sur la lasagne — et en Suisse le prix affiché engage.

### 5. « Combo Pizza révolution chorizo » n'a pas de plat de base évident

Deux candidats, tous deux à 25.00 :
- **Pizza Révolution** — jambon, champignons, oignons. **Aucun chorizo.**
- **Pizza Chorizo piquante** — du chorizo, mais pas de « révolution ».

Un rapprochement automatique par le nom se trompera. **À trancher.**

### 6. Les hamburgers viennent DÉJÀ avec leurs frites

Ta table P4 dit « Cheeseburger, Hamburger classique → Frites Classique ».
Or les deux portent le tag `fries_included` en base, et le moteur s'en
sert déjà pour **bloquer** une suggestion d'accompagnement.

Leur proposer des frites, ce serait en vendre à quelqu'un qui en a déjà
dans son assiette. **Je ne l'ai pas fait** — les hamburgers ne reçoivent
aucune suggestion d'accompagnement. À rouvrir seulement si tu confirmes
qu'ils sont servis sans frites.

### 7. Deux ambiguïtés que je n'ai pas tranchées seule

- **Coca 1.5l** : normal (8.50) et Zéro (8.50) existent tous les deux.
- **Glace 500 ml** : vanille-chocolat-**noix** et vanille-chocolat-**cookie**,
  toutes deux à 17.00, toutes deux `serves_pax = 3`.

Pour le Coca, je propose les deux — normal d'abord — et la garde « déjà au
panier » fait le reste. Si tu veux un défaut ferme, c'est **une ligne** à
changer, à un seul endroit.

### 8. Un piège que j'ai trouvé en testant, et qui aurait été invisible

`dominantCuisine` compte **tous** les articles, boissons comprises, et
exige 66 %. Un tajine seul + un Coca = 50 % → le panier cesse d'être
« anatolien »… **au moment précis où P4 devient atteignable**, puisque P3
passe avant et ne se déclenche que sans boisson.

Le chemin anatolien n'aurait donc **jamais** tourné. Il classe maintenant
sur les **plats**, jamais sur le panier entier.

### 9. Points de méthode, sans arbitrage nécessaire

- **`dish_role`, jamais le nom de catégorie.** « Entrées » mélange 3
  accompagnements et 11 entrées ; « Plats viandes » contient un plat
  végétarien (Purée forestier).
- **`margin_weight` ne départage rien.** C'est un proxy par CATÉGORIE, 4
  valeurs seulement. Il ne peut pas classer deux entrées entre elles.
  Ton étage 3 dit « le moins cher qui satisfait » — c'est ce qu'on fait.
- **Toujours par id, jamais par nom.** « Coca-Cola Zéro 0.5l », « Mini
  Rösti », « Salade mêlée », « Falafels (4 pièces) » : un lookup sur la
  graphie de la spec renvoie zéro ligne.

---

## 🔴 P1 (le combo) — BLOQUÉ, trois raisons

Tu l'appelais toi-même « le chemin le plus délicat, et le seul qui touche
la re-dérivation des prix serveur ». C'est exact, et c'est pour ça que je
m'arrête plutôt que de l'exécuter.

**(a) Le lien plat → combo n'existe nulle part.** Ni colonne, ni table, ni
fichier. Les 7 combos ont `pairs_well_with_ids` vide. Toute la table est à
écrire à la main — et elle a besoin de ton arbitrage sur le chorizo (§5).

**(b) Le moteur ne sait qu'AJOUTER, pas REMPLACER.** `UpsellSuggestion`
n'a aucune notion de remplacement, et `cartAnalysis` compte les plats et
les combos **ensemble** : un troisième est interdit dès que plat + combo
≥ 2. Un « passe en combo » implémenté comme un ajout donnerait un panier à
**deux plats facturés**. C'est un changement de structure, pas un chemin.

**(c) Le swap perd le choix de pâtes.** « Pâtes carbonara » exige une
option obligatoire (4 types de pâtes). « Combo Pâtes carbonara » n'a
**aucune option**. Après le swap, la cuisine ne sait plus quoi servir.

**Trois questions, donc :** quel plat pour le combo chorizo ? le moteur
doit-il apprendre à remplacer, ou P1 se limite-t-il à un message sans
action de panier ? et que fait-on du choix de pâtes ?

---

## P2 (la distance au palier) — spécifié, pas codé

Il vient après P1 parce qu'il **affiche des prix**, et qu'en Suisse le
prix affiché engage. Tes quatre conditions de véracité sont retenues
telles quelles :

1. ne proposer que des articles dont le prix **≥ l'écart** — sinon le seuil
   n'est pas franchi et la promesse est fausse ;
2. la décomposition s'affiche **toujours** en sous-ligne ;
3. si le client retire un article et repasse sous le seuil, les frais
   reviennent → recalcul **et on le dit**, sinon c'est du donné-repris ;
4. palier **fidélité** : aucune math de prix, et jamais de promesse de
   tampon non garanti.

Une remarque : le cas « mort en retrait » a disparu de lui-même avec B1.
Reste « toggle livraison offerte coupé » → repli sur le palier fidélité.

---

## P5, P7 — spécifiés, faciles, mais après

**P5 (dessert)** est simple, sauf le blocage Tiramisu (§1). Baklava sur
panier anatolien, glace 500 ml dès 3 plats.

**P7 (sous le minimum de zone)** n'est pas de l'upsell mais du déblocage :
on comble vers le **minimum**, pas vers la gratuité.

---

## Ce qui est utilisable et que la spec n'utilise pas

La base porte une taxonomie complète et remplie :
`upsell_tags` (121/121), `semantic_tags` (121/121),
`pairs_well_with_ids` (100/121), `avoid_with_ids` (59/121).

Les tables d'association écrites à la main sont un bon point de départ,
mais `pairs_well_with_ids` existe déjà et couvre 100 plats. Ça vaut la
peine de comparer les deux quand l'instrumentation aura tourné.

⚠️ Ne pas utiliser l'ancienne colonne `tags` : remplie sur 17/121.
