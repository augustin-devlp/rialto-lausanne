# Migrations Jet Pizza — NON EXÉCUTÉES

> **STATUT : AUCUNE de ces migrations n'a été appliquée.**
> Cible : projet Supabase **ymnhfdkyqbhucxdrnyzq** (base active Rialto).
> Préparées le 2026-05-01. À exécuter uniquement après validation d'Augustin, dans l'ordre B1 → B2 → B3.

## Contexte

- Le site jetpizza.ch est aujourd'hui un **domaine parqué** (page Nameshift) — aucun site déployé, aucune écriture en base.
- La base active ne contient qu'**un seul restaurant** : `Rialto` (slug `rialto`, id `046d930d-a4cd-4a43-a11a-7f76bfe74b06`), avec 121 menu_items.
- L'ancienne base Stampify (`curduiiydfpwiwbimypu`) est **INACTIVE (en pause)** — injoignable au moment de la préparation (timeout confirmé 2x le 2026-05-01). Voir section B3.

## Arbitrages actés (2026-05-01)

| Décision | Valeur |
|---|---|
| `restaurants.business_id` | **Reste NULL** — réservé au futur compte propriétaire. Ne PAS y mettre l'uid du user caisse. |
| Auth caisse | User `caisse-rialto@servato.ch` + table `caisse_access` — **créées par les migrations du repo `servato-caisse`** (`supabase/migrations/`), pas ici. |
| Durcissement RLS (retrait SELECT publics sur orders/order_items/order_status_history) | Géré par le repo `servato-caisse`. Audit d'impact sites : voir rapport de coordination. |
| Realtime `orders` | Géré par le repo `servato-caisse`. |

## Ordre d'exécution et dépendances

| # | Fichier | Dépendances | Fournir avant exécution |
|---|---|---|---|
| B1 | `B1_create_restaurant.sql` | — | Adresse, téléphone, horaires, minimum de commande Jet Pizza (TODO dans le fichier) |
| B2 | `B2_seed_caisse_access.sql` | B1 exécutée **+** table `caisse_access` créée par servato-caisse | uid du user `caisse-rialto@servato.ch` |
| B3a | `B3a_legacy_discovery_extraction.sql` | Ancienne base **restaurée** (voir ci-dessous) | GO d'Augustin pour la restauration |
| B3b | `B3b_seed_menu.template.sql` | B1 exécutée | Le menu Jet Pizza (extraction B3a **ou** fourni par Augustin) |

## B3 — état de la piste "catalogue legacy"

Ce qui est **su** de l'ancienne base (observations directes antérieures, avant sa mise en pause) :
- Elle contenait un restaurant `Rialto` avec exactement **121 menu_items** — le même catalogue que la base active (migré lors du découplage).
- La recherche d'un restaurant Jet Pizza distinct **n'a jamais été faite** (les requêtes de l'époque filtraient sur `%rialto%`).

Donc : **on ne sait pas** si un catalogue Jet Pizza séparé (~80 plats) existe dans l'ancienne base. Deux options :

1. **Restaurer temporairement l'ancien projet** (dashboard Supabase → Restore, ~2 min, gratuit), exécuter `B3a` en lecture seule, re-mettre en pause. B3a contient d'abord des requêtes de découverte (le catalogue existe-t-il ?) puis les requêtes d'extraction qui génèrent les INSERT pour la base active.
2. **Augustin fournit le menu** (PDF, photo du menu papier, ou texte) → on remplit `B3b` à la main.

## Garde-fous (rappel du schéma)

- `order_number` : toujours via `rpc generate_order_number` — jamais généré à la main.
- `orders.total_amount` : jamais recalculé/modifié côté base.
- Triggers `trg_orders_status_history` / `trg_orders_updated_at` : ne pas les court-circuiter.
- L'ancienne base (`curduiiydfpwiwbimypu`) : **lecture seule stricte**, ne jamais y écrire.
