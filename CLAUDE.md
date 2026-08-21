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
- **Tutoiement/vouvoiement (règle unifiée 04.08.2026, vaut aussi pour servato-site)** : la MARQUE vouvoie toujours (UI, SMS, emails, erreurs, SEO — passe globale faite le 03.08.2026). EXCEPTION : les messages PRÉ-RÉDIGÉS énoncés par le CLIENT à ses proches (partage pair-à-pair, invitations parrainage — ex. `navigator.share` de ParrainageClient) TUTOIENT — c'est l'ami qui parle, pas Rialto.
- JAMAIS d'alcool en upsell · bénéfices > fonctionnalités · aucune invention.
- Aucun paiement en ligne (règlement sur place : espèces / TWINT).
- SMS : consulter `docs/SMS_TEMPLATES.md` avant tout branchement (12 templates orphelins sur 18 ; `order_cancelled` = INTERDIT sur le flux de refus, décision contractuelle 19.07.2026).

## Ma méthode de travail (Augustin)
- Proposer puis valider avant d'exécuter ; section par section.
- Feedback honnête et direct, sans flatterie. Procédures = étapes numérotées.

## Contraintes
- Mobile-first absolu · WCAG AA · Lighthouse > 90.

## Invariants base (à respecter dans TOUT nouveau code)
- **Ordre de verrouillage : `orders` AVANT `customer_cards`, jamais l'inverse** (acté 22.07.2026). Vrai de facto aujourd'hui, mais rien dans le schéma ne l'impose : une fonction qui partirait de `customer_cards` pour lire `orders` (recalcul de tier VIP…) créerait un interblocage réel avec `credit_order_stamps`.
- Fidélité v2 : le tampon EN ATTENTE est **dérivé**, jamais écrit ; le palier/la récompense ne se calcule QUE sur `customer_cards.current_stamps` (le solidifié). Ne jamais additionner pending et acquis.
- **AMENDEMENT 20.08.2026 — « un tampon solidifié ne se reprend jamais » NE VAUT PLUS pour un RENVERSEMENT DE DÉCISION DU RESTAURATEUR.** Quand une commande ACCEPTÉE est ensuite REFUSÉE, les tampons qu'elle a crédités sont RETIRÉS (navette F7). Raison, pour qu'aucune session future ne « restaure » l'ancienne règle en croyant bien faire : l'exploit est réel et c'est le CLIENT qui le déclenche — il commande, attend l'acceptation qui crédite, fait annuler, garde le tampon ; dix fois = une pizza gratuite. Il était DÉJÀ matérialisé en base (4 lignes valant 5 tampons sur les 2 cartes les plus avancées, 8 commandes sur 52 ayant fait accepted→cancelled). **Principe général du retrait : il ne touche JAMAIS qu'à ce que CETTE commande a apporté, jamais à ce qui vient d'ailleurs** (un tampon gagné au comptoir est légitime — le client s'est déplacé — et n'est jamais confisqué au passage). Trois limites qui, elles, tiennent : récompense déjà consommée → on ne reprend rien ; jamais de solde négatif (plancher EN BASE) ; le refus DIRECT (new→cancelled, tampons jamais solidifiés) est inchangé.
- **La récompense fidélité est un ÉTAT, pas un objet** (établi sur pièces 20.08) : aucun code n'est généré au palier, `reward_available` est recalculé à chaque lecture. Faire redescendre le solde EST l'invalidation de la récompense. Corollaire pour toute future « invalidation » d'une récompense déjà comptée : la neutraliser par `value` ou `source` est un PIÈGE — le quota « 1 récompense / 7 jours » ne lit que `type`, et son refus sort AVANT le crédit : le client serait gelé 168 h ET ses tampons en ligne brûlés sans alerte. Seules voies : DELETE ou mutation du `type`.
- Tout DDL passe en **navette** (review) puis est exécuté via `apply_migration` par la conversation propriétaire du repo. Jamais de SQL brut hors historique versionné.
- **Toute migration touchant `orders` commence par `SET lock_timeout = '5s';`** (migration ET rollback) — sans cette garde, un ALTER en file derrière un verrou long gèle tous les accès à orders : blocage silencieux de la caisse (amendement navette TR1b, obligatoire depuis le 31.07.2026).
- **Livraison offerte (règle permanente, caisse 19.08.2026) : APRÈS ACTIVATION du toggle, COUPER `free_delivery_enabled` AVANT TOUT ROLLBACK DU CODE — TOUJOURS.** `restaurants.free_delivery_threshold` est RECYCLÉE en OFFSET par zone (ZL1) : un revert du code la relit comme SEUIL ABSOLU → livraison gratuite sur 100 % des commandes livrées. Corollaires : rejeu de ZL1 interdit le jour où un éditeur dashboard des zones existe (toute rebascule = navette ZLn) ; `delivery_zones` est lue EN DIRECT par la prod (un upsert de grille a effet immédiat, seul le volet seuil est inerte toggle OFF).

## Tracking (Lots B-C livrés 23.07.2026)
- Source unique des événements = `src/lib/tracking.ts` ; RIEN ne part sans consentement (clé `rialto_cookie_consent_v2`).
- **Stub gtag : TOUJOURS une `function` qui pousse l'objet `arguments`, JAMAIS un Array `...args`** — gtag.js ignore silencieusement les commandes poussées en tableau (symptôme : dataLayer visuellement correct mais `google_tag_data.ics` vide, aucun `/g/collect`, pas de `_ga`), alors que fbevents.js accepte les tableaux : Meta part, GA muet. Piège constaté en QA prod 23.07.2026.
- `consent update granted` AVANT `gtag('config')` (une page_view évaluée sous denied est retenue), ET rejoué HORS du bloc d'injection one-shot (cycle retrait → ré-acceptation).

## Écriture du code — règles d'office (Augustin 21.08.2026)
- **UNE GARDE QUI PROTÈGE UNE RÈGLE MÉTIER VIT DANS LA FONCTION, JAMAIS CHEZ CELUI QUI L'APPELLE.** Acté après la **4ᵉ** occurrence de la même classe de bug : bouton « Modifier », fiche produit, carrousel vedette, puis les 12 rails — à chaque fois un plat épuisé restait commandable, et à chaque fois parce que le filtre vivait chez l'appelant et qu'un appelant l'a oublié. Un appelant peut oublier ; la fonction, non. Concrètement : `resoudCollections()` filtre elle-même la disponibilité (`src/lib/menu/collections.ts`), et `handleSelectItem` porte une garde de dernier recours. Ne JAMAIS remonter une garde de ce type en amont « pour éviter un double filtrage ».
- 🔴 **UN COMMENTAIRE OU UN EN-TÊTE QUI DÉCRIT UNE GARDE DOIT CITER LE FICHIER ET LA LIGNE QUI L'IMPLÉMENTENT. Sans cette citation, la phrase est INTERDITE** (Augustin, 21.08.2026). Raison, sur pièces : le 21.08, six affirmations de sûreté sur huit findings de relecture n'avaient aucune ligne derrière elles — dont « PIZZA → SURTOUT PAS DE FRITES », écrit en majuscules dans un en-tête et implémenté comme une simple *absence de candidat*. Une garde écrite en majuscules mais non implémentée n'est pas une garde, c'est un vœu — et personne ne peut le vérifier en relisant. Écrire « la garde vit dans X » sans dire OÙ revient à demander au lecteur suivant de vous croire.
- **Une garantie écrite en commentaire est un claim à prouver.** Si un en-tête décrit un comportement, la ligne de code correspondante doit exister — sinon on retire la phrase. Piège constaté trois fois le 21.08 : garde des ids orphelins promise mais jamais appelée, filtrage des épuisés annoncé mais absent, `menu_items.restaurant_id` déclarée inexistante alors qu'elle est la clé de scope de tout le site.

## Utilisation des agents
- Design/UI → `designer` · comprendre avant de modifier → `explorateur` (lecture seule) · après écriture → `relecteur`.
