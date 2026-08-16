# Gate avis roue — vérification réelle (module livré 14.08.2026)

> Décision Augustin 14.08 : gate ON, vérification par l'API OFFICIELLE
> Google Business Profile UNIQUEMENT — aucun service tiers, jamais.
> Module complet prêt à brancher ; le mode DÉCLARATIF reste actif jusqu'à
> l'obtention de l'accès Google (~1-2 semaines).

## ⚠️ Garde-fous NON NÉGOCIABLES (toute copie liée à ce flux)

- On demande **UN avis** — JAMAIS « un avis positif », JAMAIS « 5
  étoiles », aucun gating par la note (illégal/CGU Google).
- La récompense est une **« chance de gagner »** (la roue a des segments
  perdants) — jamais un gain garanti.

## Les trois modes (`REVIEW_GATE_MODE` + `NEXT_PUBLIC_REVIEW_GATE_MODE`)

| Mode | Qui vérifie | État |
|---|---|---|
| `declarative` (défaut) | Personne — honor-based 60 s (verify-review-degraded) | **ACTIF aujourd'hui** |
| `api` | Business Profile API : l'avis existe, au bon nom, publié après la déclaration | Prêt, attend les credentials |
| `mock` | Fixtures `MOCK_REVIEWS_JSON` | Dév/QA uniquement |

## Le flux (mode api)

1. Post-commande : carte « Votre avis compte » sur /confirmation (visible
   une fois la commande LIVRÉE/PRÊTE — phase dérivée, pas avant) → page
   roue. État B de la roue : lien DIRECT vers le formulaire d'avis de la
   fiche (`search.google.com/local/writereview?placeid=…`).
2. Le client saisit **son nom Google** → `POST /api/rialto/loyalty/review-request`.
   Le POST prend un **snapshot `seen_review_ids`** (avis déjà publics à cet
   instant) : parade au vol d'avis — le nom affiché sur un avis public
   n'est un secret pour personne, un tiers ne peut pas déclarer le nom
   d'un avis déjà paru pour capter le tour.
3. Vérification : `matchReview` (nom normalisé strict — accents, casse,
   ı turc — + avis publié APRÈS la déclaration ; tolérance 1 h en amont
   avec snapshot, 10 min sans). ⚠️ En pratique le snapshot NEUTRALISE la
   tolérance amont pour tout avis déjà VISIBLE de l'API au moment du
   POST (il est dans `seen_review_ids` → exclu, même dans l'heure) : la
   tolérance ne sert que les avis postés juste avant la déclaration mais
   pas encore listés par Google (latence de publication) — c'est voulu,
   c'est la parade au vol d'avis. Match → claim `google_review_claims`
   (`is_degraded_mode=false`) → **la roue se débloque par le flux
   existant, spin/route.ts inchangé**.
4. Pas encore publié → « en cours de publication » : re-checks
   automatiques (UI 90 s + retour au premier plan ; serveur throttlé à
   2 min par update conditionnel — settle-on-read, pas de cron) + lien de
   retour au formulaire. Caches serveur : jeton OAuth 55 min, liste
   d'avis 60 s — N clients en attente ≈ 1 appel Google/min.
5. « Mon avis n'apparaît pas » → `manual_pending` → écran dashboard
   **/dashboard/avis** (routes `GET /api/dashboard/reviews`,
   `POST /api/dashboard/reviews/approve`). L'approve refuse (409
   `claim_deja_actif`) si le client détient déjà un claim valide.
6. **1 avis = 1 roue max** : contrainte UNIQUE de `google_review_claims`
   (business_id, author, review_time) — **VÉRIFIÉE en base le 14.08**
   (pg_constraint). Un avis déjà consommé re-matché part en 23505 → la
   requête bascule en `manual_pending` (le restaurateur tranche, les
   re-checks s'arrêtent — c'est aussi l'issue pour la victime d'un vol).
7. Requête expirée après 7 jours de re-checks infructueux. L'expiration
   est du settle-on-read : elle n'est CONSTATÉE qu'au GET/POST suivant —
   elle ne joue donc pas en mode déclaratif (routes en 503, les pending
   restent dormantes). Et le premier POST après la fenêtre CONSTATE
   l'expiration (il renvoie la requête `expired`) : c'est la soumission
   SUIVANTE du formulaire qui crée la nouvelle déclaration.
8. Renouvellement (**décision Augustin 15.08 — implémenté**) : Google
   n'autorise qu'UN avis par personne et par fiche, à vie — au cycle
   suivant (claim expiré), le gate **RE-VALIDE que l'avis déjà vérifié
   existe toujours** au lieu d'exiger un avis neuf (settle-on-read,
   ancrage strict nom normalisé + createTime original, tolérance 2 s) :
   - toujours en ligne → **nouveau claim** (`review_time = now()`,
     pattern du claim manuel — la contrainte UNIQUE reste saine) ; le
     `matched_review_time` de la requête n'est **jamais réécrit**, c'est
     l'ancrage permanent des re-validations futures ;
   - **suppression PROUVÉE** → la requête passe `expired`, le gate
     repart de zéro (après suppression, Google autorise un nouvel
     avis). ⚠️ « Supprimé » est une INFÉRENCE : elle n'est valable que
     sur `listReviewsCovering` (pagination avec **preuve de
     couverture** — jusqu'à `min(updateTime) < ancrage` ou fiche
     épuisée, plafond 10 pages) ET liste non vide. Une absence dans la
     liste tronquée des 50 récents, une liste vide ou une couverture
     non prouvée = **non concluant** → aucune écriture, on réessaie
     (relecture 15.08 : « absence ≠ suppression ») ;
   - `manual_approved` n'a pas d'ancrage API → pas de renouvellement
     automatique : re-déclaration ou nouvelle validation manuelle ;
   - ancrage établi **sans snapshot** (`seen_review_ids` null, provider
     injoignable à la déclaration) → pas de renouvellement automatique
     non plus : un avis capté par un tiers dans la tolérance 10 min
     deviendrait sinon une rente à vie (relecture 15.08).
   Le payload GET/POST expose `claim_actif` pour verified/manual_approved
   — l'UI n'annonce « débloqué » que sur `true` ; `false` = écran
   « re-vérification en cours » + re-checks (90 s, throttle serveur
   2 min). Aucun impact DDL : statuts et colonnes RV1b inchangés (le
   statut `expired` couvre aussi « avis supprimé / gate remis à zéro »).

## Divergence des deux variables de mode

`REVIEW_GATE_MODE` (serveur) et `NEXT_PUBLIC_REVIEW_GATE_MODE` (UI,
**inlinée au build**) doivent être identiques. Si elles divergent :
- serveur `api` / UI `declarative` → l'UI montre l'ancien modal 60 s,
  la vérification réelle n'est jamais sollicitée ;
- serveur `declarative` / UI `api` → ReviewGateApi reçoit des 503
  `mode_declaratif_actif`.
Diagnostic : le GET/POST review-request renvoie `mode` dans chaque
payload — comparer avec ce que l'UI croit. Toute bascule = poser LES
DEUX + **redeploy** (la NEXT_PUBLIC ne change pas sans rebuild).

## Migration RV1b — EN NAVETTE

`db/reviews/RV1b_review_verification_requests.sql` : table des requêtes
(pending/verified/manual_pending/manual_approved/expired/rejected),
RLS activée SANS policy (service role only, pattern loyalty), CHECK de
cohérence claim, aucune table existante modifiée. Révision du RV1
initial après verdict caisse KO du 15.08 (7 points, dont le bloquant
RLS). À exécuter via apply_migration APRÈS retour de navette caisse.
Tant qu'elle n'est pas exécutée, les routes répondent 503
`rv1_non_executee` (et le mode déclaratif ne les appelle pas).

## Procédure d'accès Google (en cours, ~1-2 semaines)

1. Le restaurateur ajoute Augustin **Manager** de la fiche (lundi 17.08).
2. Projet Google Cloud → activer « Google Business Profile API » →
   remplir le **formulaire de demande d'accès** (le quota par défaut est
   0 tant que Google n'a pas approuvé — délai habituel ~2 semaines).
3. Créer un **service account**, puis l'INVITER comme Manager de la
   fiche (c'est l'invitation qui lui ouvre les avis).
4. Récupérer account/location IDs (`accounts.list`, `locations.list`).

## Bascule jour J — rien d'autre que ceci

1. Exécuter RV1b (si le retour de navette n'était pas déjà fait).
2. Poser sur Vercel : `GBP_SA_CLIENT_EMAIL`, `GBP_SA_PRIVATE_KEY`,
   `GBP_ACCOUNT_ID`, `GBP_LOCATION_ID`,
   `REVIEW_GATE_MODE=api`, `NEXT_PUBLIC_REVIEW_GATE_MODE=api`.
3. Redeploy. QA : mock d'abord (`mode=mock` + `MOCK_REVIEWS_JSON`) si on
   veut répéter le flux, puis un avis réel de test.

Retour arrière : `REVIEW_GATE_MODE=declarative` +
`NEXT_PUBLIC_REVIEW_GATE_MODE=declarative` + **redeploy obligatoire**
(la NEXT_PUBLIC est inlinée au build — sans redeploy l'UI reste en mode
api et mange des 503). Le flux honor-based reprend, rien d'autre ne
bouge. Sort des requêtes `pending` en cours : elles cessent d'être
re-checkées (les routes répondent 503) et restent DORMANTES — l'expiration
J+7 est du settle-on-read, elle ne se constate qu'à un GET/POST qui
n'arrive plus en mode déclaratif ; elles s'expireront au premier passage
si le mode api revient. Les claims déjà créés restent valides — aucun
client ne perd un tour déjà débloqué.
