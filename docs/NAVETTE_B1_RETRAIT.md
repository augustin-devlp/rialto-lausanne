# Navette — suppression du retrait en magasin (B1)

**Émetteur :** repo `rialto-lausanne` · **Destinataire :** repo `servato-caisse`
**Date :** 21.08.2026 · **Gel du code :** 25.08 · **Go-live :** 01.09

---

## Ce qui a déjà été fait, côté site, sans rien casser

Le site force désormais la livraison **côté serveur**. Aucune commande de
retrait ne peut plus naître.

Le trou était réel et il pointait dans le mauvais sens : le code retombait
sur `"pickup"` quand le champ manquait (`api/orders/route.ts`), **et** la
colonne en base a `DEFAULT 'pickup'`. Deux défauts alignés. Un panier d'une
vieille version du site, ou un appel forgé, créait une commande de retrait —
et la caisse imprimait alors **un ticket sans adresse**. Le livreur partait
sans savoir où aller, sans la moindre erreur à l'écran.

**Aucune migration n'a été nécessaire pour ça.** Un littéral suffit.

---

## 🔴 Le point dur : la caisse casse, et elle ne se met pas à jour à distance

La caisse **lit `public.orders` en direct**, via PostgREST, avec une liste de
colonnes **explicite qui nomme `fulfillment_type`**
(`src/hooks/useCommandesEnDirect.ts`), plus un canal Realtime qui transporte
la ligne entière. **Il n'y a aucune API entre les deux repos** : un changement
de schéma la touche à la seconde, sans déploiement.

Et il n'y a **pas d'OTA** : `capacitor.config.json` n'a aucune clé `server`,
l'APK embarque son bundle. Un correctif caisse se **réinstalle à la main sur
la Sunmi**, il ne se pousse pas.

**Nuance à ne pas écrire de travers : la caisse est déjà en usage réel.**
Elle écrit `printed_at` sur de vraies commandes — dernier ticket imprimé le
20.08.2026 à 22:05 sur `R-2026-052`. Ne pas raisonner comme si elle dormait.

### Ce qui casse, précisément

La logique caisse n'est jamais « si retrait », c'est toujours
**« livraison, sinon à emporter »** — donc toute valeur inattendue bascule
vers l'affichage « à emporter ».

**Correction du 21.08, remontée par la caisse elle-même : ce sont HUIT
points d'affichage dans CINQ fichiers, pas quatre.** Mon inventaire initial
en comptait quatre — il sous-estimait. Le compte de la caisse fait foi, et
c'est son dépôt.

| Fichier | Ce qu'il fait |
|---|---|
| `src/components/OrderCard.tsx` | badge « À EMPORTER », bloc « Souhaité pour HH:MM » |
| `src/lib/printTicket.ts` | **ticket papier** : bloc livraison (adresse, code d'entrée, étage, sonnette) vs « A EMPORTER » en double hauteur |
| `src/lib/labels.ts` | « Espèces au livreur » vs « Espèces au retrait » |
| `src/lib/types.ts` | type miroir |
| *(cinquième fichier — à nommer par la caisse)* | |

⚠️ **Le ticket « à emporter » n'imprime qu'UNE ligne.** C'est ce qui rend
le mode de panne n°1 si discret : le livreur reçoit un ticket qui a l'air
normal, simplement sans le bloc adresse.

**Deux modes de panne, très différents :**

1. **Si le champ disparaît du payload sans que la colonne change** — la base
   écrit `'pickup'` toute seule (le DEFAULT), et **la caisse ne plante pas :
   elle ment.** Ticket sans adresse, livreur perdu, aucun signal.
   *→ C'est le mode que le correctif site vient de fermer.*

2. **Si on fait un `DROP COLUMN`** — le SELECT explicite échoue, la
   réconciliation au démarrage retourne faux… **mais la bannière HORS LIGNE
   ne se lève pas** (elle dépend du heartbeat Realtime, pas du fetch). La
   caisse a l'air en ligne, et les commandes du démarrage sont perdues.
   *→ C'est le mode à éviter absolument.*

### Le script de fixtures casse aussi

`creer-commande-test.mjs` prend littéralement `pickup` en argument.

**Proposition de la caisse, ACCEPTÉE par Augustin le 21.08 : renommer cet
argument `minimal`, en livraison.** Le script garde son rôle (créer une
commande de test dépouillée) sans porter le nom d'un mode qui n'existe
plus. À faire dans le même lot que le reste.

---

## L'ordre de déploiement — il n'est pas négociable

**La caisse bouge EN PREMIER. Toujours.**

1. **Caisse** — retirer les quatre branchements, ne plus sélectionner
   `fulfillment_type`, corriger le script de fixtures. Puis **réinstaller
   l'APK à la main sur la Sunmi**, et vérifier qu'un ticket sort avec
   l'adresse.
2. **Constater** que la caisse tourne sans la colonne pendant au moins un
   service complet.
3. **Site** — retirer les branches de lecture restantes (le stepper
   « À retirer au comptoir », les ternaires d'affichage de
   `ConfirmationClient`).
4. **Base** — la migration, en dernier (voir plus bas).

**Si l'ordre est inversé** — colonne supprimée avant la caisse — la caisse
perd sa réconciliation au démarrage **sans lever de bannière**, et il faut
retourner physiquement à la Sunmi pour réinstaller. En plein service, c'est
un service perdu.

---

## La migration, quand son tour viendra

Elle n'est **pas** nécessaire pour supprimer le retrait — le site l'impose
déjà. Elle sert à empêcher qu'il revienne par la base.

🔴 **DÉCISION D'AUGUSTIN, 21.08 : LE `CHECK` EN BASE RESTE À DEUX VALEURS.
La suppression du retrait est APPLICATIVE, pas structurelle.**

Raison : le resserrer exigerait de traiter les 8 lignes de fixtures, et la
caisse a montré que les toucher est risqué. On le resserrera au **grand
ménage du go-live**, quand ces lignes partiront de toute façon.

Il reste donc UNE seule ligne utile, et elle n'est pas urgente :

```sql
-- ⚠️ Obligatoire sur toute migration touchant `orders`
SET lock_timeout = '5s';

-- Le DEFAULT 'pickup' est le second défaut aligné dans le mauvais sens.
-- Le serveur impose déjà « delivery » à l'INSERT ; ceci ferme la porte
-- côté base pour tout écrivain futur (import, script, autre repo).
ALTER TABLE public.orders ALTER COLUMN fulfillment_type SET DEFAULT 'delivery';

-- PAS de resserrement du CHECK. PAS de DROP COLUMN. Voir ci-dessus.
```

⚠️ Le rôle `authenticated` — celui de la caisse — **ne peut pas écrire cette
colonne** (ses seules colonnes en UPDATE sont `status`, `cancellation_reason`,
`printed_at`). Tout backfill exige `service_role`. C'est une bonne nouvelle :
la caisse ne peut pas recréer une commande de retrait par accident.

### Le sort des 8 commandes de test — options, pas décision

Il y a **8 commandes** en `fulfillment_type = 'pickup'`, toutes des fixtures.

- **(a) Les laisser.** Rien ne plante : tous les affichages sont des
  ternaires binaires, elles montrent simplement « Retrait ». Mais elles
  bloquent le resserrement du `CHECK`.
- **(b) Les passer en `delivery`.** Elles n'ont pas d'adresse de livraison —
  elles s'afficheraient donc comme des livraisons sans adresse. Pire que (a).
- **(c) Les supprimer.** Elles sont déjà dans le périmètre du **grand ménage
  des données de test** prévu avant l'ouverture (`GO_LIVE.md`). C'est
  probablement là qu'elles doivent partir, pas dans ce lot.

**Ma recommandation : (c), et donc ne rien faire ici.** Le nettoyage a déjà
son créneau et son propre contrôle.

---

## ⚠️ Un effet de bord que ce lot rend visible, et qui n'est PAS corrigé

En retirant la branche morte, on découvre que la validation des horaires
(ouverture, fermeture, temps de préparation) ne s'appliquait **qu'au
retrait**. Or le site n'envoie que « delivery ».

**Donc ce contrôle n'a jamais tourné en production, et une livraison
PLANIFIÉE n'est aujourd'hui bornée par aucun horaire côté serveur.**

L'étendre à la livraison **changerait une règle métier** : des commandes
aujourd'hui acceptées seraient refusées. Ce n'est pas une décision de
nettoyage. **La question est posée à Augustin ; la garde n'est pas posée.**

Autre effet de bord signalé, non corrigé : `restaurants.offers_pickup` est
lu par le serveur et **jamais testé**. La règle « Rialto ne fait pas de
retrait » n'était donc exécutoire nulle part avant aujourd'hui.

---

## Ce qui n'est PAS dans ce lot, et pourquoi

Les branches de **lecture** côté site (le stepper « À retirer au comptoir »,
les ternaires d'affichage) restent en place. Ce n'est pas un oubli : tant
que la colonne existe et que 8 lignes valent `'pickup'`, supprimer les
branches de lecture ferait **mentir le site sur ces commandes**. Elles
partent à l'étape 3 de l'ordre ci-dessus, pas avant.

Quatre **templates SMS** en base mentionnent le retrait
(`order_confirmation`, `order_ready`, `order_accepted`) — tous **orphelins**,
aucun n'est branché. Ils vivent en base : les corriger est une écriture, donc
hors périmètre autorisé. À traiter avec le lot SMS.
`reward_unlocked` dit « présentez votre carte au comptoir » : c'est la
**récompense fidélité**, pas une commande — à ne pas toucher.
