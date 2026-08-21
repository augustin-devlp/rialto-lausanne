# Trois migrations en attente de GO

**22.08.2026** · Base cible : `ymnhfdkyqbhucxdrnyzq`.
**Aucune n'est exécutée.** Tous les chiffres ci-dessous sont relevés en base
ce soir, en lecture seule.

Ordre d'exécution recommandé : **CU1 → PR1 → NU1**. Elles ne se touchent
pas, mais NU1 est celle qui peut faire perdre une commande si elle est mal
amorcée — autant qu'elle passe sur une base déjà stabilisée.

---

## ⑤ CU1 — retirer `customers_email_unique`

📄 [`db/clients/CU1_retrait_index_email.sql`](../db/clients/CU1_retrait_index_email.sql)

### État en base ce soir

| | |
|---|---|
| Clients | **5** |
| Clients avec un e-mail | **0** |
| E-mails en doublon | **0** |
| L'index a-t-il déjà indexé une ligne ? | **jamais** |

### Ce qui change

Un `DROP INDEX`. C'est tout. L'objet est un **index nu** (absent de
`pg_constraint`), donc pas de `DROP CONSTRAINT`, pas de cascade.

### Ce que ça répare

- **La commande** : le 2ᵉ membre d'un foyer garde son e-mail sur sa fiche
  au lieu de le perdre en silence.
- **La carte de fidélité** : il peut enfin la créer. Aujourd'hui c'est un
  500 sec — sans reprise avant ce soir.
- **La session client par e-mail** : elle est *bloquée* par cet index.

### Ce que ça casse

Rien de mesurable. Sept vérifications dans la navette : aucune route ne
cherche par e-mail, aucun `onConflict`, aucune fonction SQL, aucun trigger,
aucune RLS, aucune contrainte adossée.

### Rollback

⚠️ **Il a une date de péremption.** Il recrée un index unique : il ne passe
que tant qu'aucune adresse n'est portée par deux fiches. **Réversible ce
soir, irréversible peu après le go-live.** La requête de contrôle est dans
la navette.

### 🔴 À faire avant le GO

`grep -ri email` sur **`servato-caisse`** — c'est la seule surface que je ne
peux pas lire d'ici.

---

## ⑥ PR1 — amendée : les DEUX portes, pas une

📄 [`db/prix/PR1_journal_ecarts_et_hy2_order_items.sql`](../db/prix/PR1_journal_ecarts_et_hy2_order_items.sql)

### 🔴 Ce que l'amendement change, et pourquoi il fallait le faire

Relevé en base ce soir :

| table | policy | cmd | rôles | `WITH CHECK` |
|---|---|---|---|---|
| `orders` | `Public insert orders` | INSERT | **PUBLIC** | `true` |
| `order_items` | `Public insert order_items` | INSERT | **PUBLIC** | `true` |

**PR1 n'en fermait qu'une.** Or fermer `order_items` seul ne sert à rien :
un `INSERT` direct dans `orders` crée une commande de toutes pièces, avec
le `total_amount` qu'on veut. **La re-dérivation des prix serveur — tout
l'objet de PR1 — restait contournable** avec la clé publique du bundle.

Le nouveau **BLOC 3** ferme `orders` avec le prédicat `caisse_access`,
**exactement le même** que `caisse_read_orders` et `caisse_update_orders`,
déjà en production. On ne réinvente pas un prédicat de sécurité.

### La clause `caisse_access` : pourquoi elle, et pas une révocation sèche

Révoquer l'`INSERT` à `authenticated` tout court **tuerait le script de
fixtures**, qui s'authentifie en utilisateur caisse. Avec le prédicat, un
utilisateur caisse insère sur **son** restaurant et personne d'autre
n'insère rien.

### Ce que ça ne casse pas

**Le site n'est pas concerné.** `POST /api/orders` écrit avec
`supabaseService()` (service_role), qui **ignore la RLS**. Aucune écriture
du site ne passe par une policy.
`caisse_read_orders` et `caisse_update_orders` sont **intactes** — la
caisse continue de lire et d'écrire les statuts (lot CL1).

### ⚠️ Ce que je n'ai pas pu vérifier

**Je n'ai pas trouvé le script de fixtures dans ce dépôt** (`scripts/` ne
contient que `stamp-sw.mjs`). J'ai écrit la clause d'après ta consigne et
d'après le prédicat déjà en production. **Si les fixtures s'authentifient
autrement qu'en utilisateur caisse, dis-le-moi avant le GO** — le bloc 3
les casserait.

### Rollback

Dans la navette, dans l'ordre inverse. ⚠️ Re-granter `ALL` restaure l'état
troué : c'est écrit dans le fichier.

---

## ⑦ NU1 — la numérotation

📄 [`db/orders/NU1_numerotation_sans_course.sql`](../db/orders/NU1_numerotation_sans_course.sql)

### Ce que fait la fonction aujourd'hui

```sql
select count(*)+1 into v_count from public.orders
 where restaurant_id = p_restaurant and to_char(created_at,'YYYY') = v_year;
```

Elle **compte les lignes**. Et `order_number` porte un index **UNIQUE**
(`orders_order_number_key`). Un doublon n'est donc pas une gêne
d'affichage : **c'est une commande refusée.**

### Défaut 1 — la course

Deux commandes à la même seconde lisent le même `count(*)`, obtiennent le
même numéro. La première passe, **la seconde est rejetée**. Un vendredi à
19h30, ce n'est pas un cas d'école.

### 🔴 Défaut 2 — celui qui se déclenche au go-live

Relevé en base ce soir :

| | |
|---|---|
| Commandes 2026 | **52** |
| dont au format `R-2026-NNN` | **33** |
| dont au format `TEST-…` | **19** |
| Plus grand rang réellement utilisé | **52** |

Aujourd'hui ça tient **par accident** : 52 lignes → rang 53, libre.

⚠️ **Le jour où tu supprimes les 19 commandes de test — c'est-à-dire le
nettoyage avant le go-live, le geste le plus normal du monde —** `count(*)`
tombe à 33. La fonction rend `R-2026-034`. **Ce numéro existe déjà.**
L'index refuse. La commande est perdue. Et ça recommence à la suivante :
**environ dix-neuf commandes refusées d'affilée**, le soir du lancement,
sans que rien dans le code ne dise pourquoi.

La suppression d'**une seule** commande suffit à armer le même piège.

### Ce que fait la migration

Une table `order_counters (restaurant_id, annee, dernier)`, incrémentée par
un `INSERT … ON CONFLICT DO UPDATE … RETURNING` — **une seule instruction,
donc atomique**. La course disparaît par construction, pas par une garde à
maintenir. Et un compteur **ne redescend jamais** quand on efface une ligne.

**Amorçage** : au `MAX` du suffixe des numéros au bon format — jamais au
`count(*)`. C'est la seule valeur qui garantit qu'aucun numéro attribué ne
sera rejoué. Les `TEST-…` sont ignorés : ils n'ont pas de rang.

### Ce qui ne change pas

Le **format** (`R-2026-053`), la **signature** de la fonction, son
**appelant**. Le site n'a pas une ligne à modifier — un seul appel,
`orders/route.ts`, en `service_role`.

Les numéros restent **séquentiels donc devinables** : ce n'est pas l'objet
de cette navette, c'est le jeton HMAC livré le 21.08 qui répond à ça.

### ⚠️ Question ouverte avant le GO

La navette révoque l'`EXECUTE` public et le grant à `service_role` seul.
**Si la caisse doit un jour créer des commandes comptoir**, il lui faudra
ce grant. Dis-moi si c'est au programme.

### Rollback

⚠️ **Il remet le bug** (la course *et* la redescente). Et il a une
condition, écrite dans la navette : si des commandes ont été créées depuis
NU1, `count(*)` ne retombe pas sur le bon rang — il faut vérifier avant,
sinon le premier client d'après le rollback se fait refuser.

---

## Après GO — ce que je ferai, dans l'ordre

1. `apply_migration` pour chacune, séparément.
2. Preuve pour chacune : l'état des catalogues **avant/après**, et pour NU1
   la valeur du compteur (attendu : **52**, donc prochaine commande
   `R-2026-053` — inchangé).
3. Hygiène post-CU1 : redater les deux commentaires de `orders/route.ts`
   qui décrivent un piège disparu, **sans retirer la reprise 23505** — elle
   reste nécessaire pour les collisions de **téléphone**.
