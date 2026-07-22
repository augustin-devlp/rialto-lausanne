# CLAUDE.md — Projet rialto-lausanne

> Lu par Claude Code à chaque session. Court et dense.

## Le projet
Site de COMMANDE en ligne du restaurant **Rialto** (pizzeria, Av. de Béthusy, Lausanne) — premier client réel de Servato. Next.js (App Router) + TypeScript + Tailwind + Supabase. Déploiement Vercel.
Base Supabase dédiée : `ymnhfdkyqbhucxdrnyzq`. Ancienne base partagée Stampify `curduiiydfpwiwbimypu` = **LECTURE SEULE**, ne jamais y écrire.

## Charte visuelle (propre à Rialto — NE PAS dévier)
- Palette « Italien chaleureux » : terracotta `#C73E1D` (dark `#A02E14`, 700 `#8F2D16`), crème `#F9F1E4` (dark `#EFE4CE`), safran `#E6A12C` (dark `#C48617`).
- Neutres : ink `#1A1A1A`, mute `#6B6B6B`, surface `#FAFAF7`, border `#E8E3D8`.
- Typo : **Fraunces** (serif, titres éditoriaux) + **Inter** (corps), via next/font.
- Style : éditorial chaleureux, généreux, appétissant. ⚠️ Ne JAMAIS utiliser le teal Servato ici.

## Règles métier
- Vouvoiement systématique pour **TOUS les messages clients** — upsell, fidélité, erreurs, sans exception (décision Augustin 2026-07-11 ; l'ancienne tolérance tutoiement sur l'upsell est caduque). NB : le reste du Club (loterie, etc.) tutoie encore par héritage → passe globale prévue dans un lot cosmétique dédié, ne pas corriger au fil de l'eau.
- JAMAIS d'alcool en upsell · bénéfices > fonctionnalités · aucune invention.
- Aucun paiement en ligne (règlement sur place : espèces / TWINT).

## Ma méthode de travail (Augustin)
- Proposer puis valider avant d'exécuter ; section par section.
- Feedback honnête et direct, sans flatterie. Procédures = étapes numérotées.

## Contraintes
- Mobile-first absolu · WCAG AA · Lighthouse > 90.

## Invariants base (à respecter dans TOUT nouveau code)
- **Ordre de verrouillage : `orders` AVANT `customer_cards`, jamais l'inverse** (acté 22.07.2026). Vrai de facto aujourd'hui, mais rien dans le schéma ne l'impose : une fonction qui partirait de `customer_cards` pour lire `orders` (recalcul de tier VIP…) créerait un interblocage réel avec `credit_order_stamps`.
- Fidélité v2 : le tampon EN ATTENTE est **dérivé**, jamais écrit ; le palier/la récompense ne se calcule QUE sur `customer_cards.current_stamps` (le solidifié). Ne jamais additionner pending et acquis.
- Tout DDL passe en **navette** (review) puis est exécuté via `apply_migration` par la conversation propriétaire du repo. Jamais de SQL brut hors historique versionné.

## Utilisation des agents
- Design/UI → `designer` · comprendre avant de modifier → `explorateur` (lecture seule) · après écriture → `relecteur`.
