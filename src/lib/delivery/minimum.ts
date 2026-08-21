/**
 * MINIMUM DE COMMANDE PAR ZONE — DÉRIVATION UNIQUE (Augustin, 22.08.2026).
 *
 * Troisième fermeture de la même classe cette semaine, après le seuil de
 * gratuité et la qualification de zone. Le motif est toujours le même :
 * deux endroits qui calculent la même chose finissent par diverger, et le
 * jour où ça arrive, l'écran promet ce que la facture ne tient pas.
 *
 * ────────────────────────────────────────────────────────────────────
 * CE QUI EXISTAIT AVANT, ET QUI DIVERGEAIT DÉJÀ
 * ────────────────────────────────────────────────────────────────────
 * Deux formules, deux résultats :
 *   · `CartPanel` : `Math.max(0, minOrderAmount - subtotal)`, flottant brut,
 *     affiché par `toFixed(2)` — donc arrondi au PLUS PROCHE.
 *   · `api/rialto/upsell` : arrondi au centime SUPÉRIEUR.
 * Les deux montants s'affichent à trente pixels l'un de l'autre dans le
 * même tiroir et peuvent différer d'un centime.
 *
 * 🔴 ET UN BUG QUE LA DIVERGENCE CACHAIT : `canCheckout` testait
 * `missing === 0`, c'est-à-dire une ÉGALITÉ FLOTTANTE À ZÉRO. Un panier
 * PILE au minimum dont la somme laisse un résidu de 3e-15 donnait
 * `missing !== 0` → bouton « Passer la commande » DÉSACTIVÉ, sous un
 * message « Encore 0.00 CHF ». Le client lit qu'il ne manque rien et ne
 * peut pas commander. Le serveur, lui, a toujours eu sa tolérance
 * (`rule.ts`, le `- 0.005`). C'est cette tolérance qui vit ici désormais.
 *
 * ────────────────────────────────────────────────────────────────────
 * QUI FAIT FOI
 * ────────────────────────────────────────────────────────────────────
 * ⚠️ LA VÉRITÉ EST `delivery_zones.min_order_amount`, RELUE SERVEUR À
 * PARTIR DU CODE POSTAL AU MOMENT DE LA COMMANDE — c'est la seule valeur
 * qui provoque réellement un refus (`api/orders/route.ts`). Tout ce que le
 * client détient est une COPIE PÉRISSABLE : le snapshot `localStorage`
 * écrit à la qualification de l'adresse.
 *
 * Ce module unifie la FORMULE. Il ne supprime pas la fenêtre de
 * péremption du snapshot — un upsert de grille a effet immédiat en
 * production, et le snapshot ne se rafraîchit qu'aux moments de
 * qualification. Ce qui limite les dégâts : `POST /api/orders` re-dérive
 * et refuse sur la valeur LIVE, donc le client n'obtient jamais une
 * commande à un minimum périmé — il peut seulement lire un mauvais
 * montant avant.
 *
 * ────────────────────────────────────────────────────────────────────
 * L'ASSIETTE N'EST PAS UNIFIÉE, ET C'EST VOLONTAIRE
 * ────────────────────────────────────────────────────────────────────
 * ⚠️ Ces fonctions prennent le sous-total EN PARAMÈTRE et ne le calculent
 * jamais. Trois assiettes coexistent légitimement : le panier client
 * (prix figés), le sous-total re-dérivé du serveur (prix du jour), et le
 * sous-total upsell (extras d'options relus en base). La règle du
 * 24.07.2026 tient : ne JAMAIS unifier les assiettes. On unifie la
 * FORMULE, pas la MATIÈRE.
 */

import { atteint as seuilAtteint, manqueJusqua } from "@/lib/money";

/**
 * ⚠️ CONSERVÉ POUR LES APPELANTS EXISTANTS, MAIS PLUS UTILISÉ ICI.
 * La tolérance d'un demi-centime a été remplacée le 22.08 par une
 * comparaison en CENTIMES ENTIERS (`src/lib/money.ts`) — règle gravée par
 * Augustin : aucune comparaison d'argent ne se fait en flottant.
 * Une tolérance marche, mais elle laisse ouverte la question « combien ? »
 * à chaque nouvel appelant ; les centimes ne laissent rien d'ouvert.
 */
export const TOLERANCE_CHF = 0.005;

/**
 * Repli quand la zone ne porte pas de minimum exploitable.
 *
 * ⚠️ POURQUOI 25 ET NON 0. Trois écrivains du snapshot faisaient
 * `Number(body.zone.min_order_amount)` sans repli — or `Number(null)`
 * vaut **0**, c'est-à-dire « aucun minimum » : porte grande ouverte côté
 * client, refus côté serveur, et une barre de progression qui divise par
 * zéro. Un repli à 0 se trompe toujours dans le sens DANGEREUX.
 * 25 est le minimum de l'anneau A, donc le plus bas réellement pratiqué :
 * il ne bloque jamais au-delà du vrai minimum d'une zone qui existe, et il
 * n'ouvre jamais la porte. Le serveur reste l'autorité dans les deux cas.
 */
export const MINIMUM_DE_REPLI_CHF = 25;

/** Ce que le module rend. `remaining` porte le nom déjà utilisé côté upsell. */
export interface EcartMinimum {
  /** Le minimum de la zone, pour le message. */
  minimum: number;
  /** true si le panier peut passer commande, au regard du minimum seul. */
  atteint: boolean;
  /** Reste à ajouter (0 si atteint). Arrondi au centime SUPÉRIEUR. */
  remaining: number;
}

/**
 * LE SEUL endroit qui décide du minimum applicable.
 *
 * ⚠️ Accepte volontairement une zone partielle : le snapshot `localStorage`
 * peut avoir été écrit par une version antérieure du code, ou amputé.
 */
export function minimumDeZone(
  zone: { min_order_amount?: number | string | null } | null | undefined,
): number {
  const brut = Number(zone?.min_order_amount);
  if (!Number.isFinite(brut) || brut <= 0) return MINIMUM_DE_REPLI_CHF;
  return brut;
}

/**
 * L'écart au minimum. Formule identique à `getFreeDeliveryMilestone`.
 *
 * ⚠️ NE PAS « SIMPLIFIER » en `Math.ceil(minimum - sousTotal)` : la
 * normalisation au 1/100e de centime AVANT le `ceil` évite de sur-corriger
 * d'un centime sur les prix en .90/.80 (formule re-vérifiée
 * numériquement le 28.07.2026 sur le palier de gratuité).
 * Le plancher 0.01 garantit qu'un résidu ne s'affiche jamais « 0.00 ».
 */
export function ecartAuMinimum(
  sousTotal: number,
  zone: { min_order_amount?: number | string | null } | null | undefined,
): EcartMinimum {
  const minimum = minimumDeZone(zone);
  const montant = Number.isFinite(sousTotal) ? sousTotal : 0;

  // 🔴 COMPARAISON EN CENTIMES ENTIERS (`src/lib/money.ts`). Le
  // « Encore 0.00 CHF » avec bouton désactivé ne peut plus exister : soit
  // le seuil est atteint et il manque 0, soit il manque au moins 1 centime.
  // C'est une propriété de la représentation, plus une garde à maintenir.
  return {
    minimum,
    atteint: seuilAtteint(montant, minimum),
    remaining: manqueJusqua(montant, minimum),
  };
}
