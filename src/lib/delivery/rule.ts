/**
 * Livraison offerte — LA règle, à un seul endroit (LS1 24.07.2026,
 * refonte PAR ZONE 18.08.2026, chantier zones décisions 1-2).
 *
 * LE SEUIL EST DÉRIVÉ, PAS STOCKÉ : seuil(zone) = min_order_amount de la
 * zone + OFFSET global. La colonne restaurants.free_delivery_threshold
 * est RECYCLÉE en offset (15 par défaut — ZL1 pose la valeur) ;
 * free_delivery_enabled reste l'interrupteur maître. Un seul bouton, un
 * seul chiffre au dashboard : la grille (A dès 40, B dès 50, C dès 60,
 * D dès 70) suit les minimums de zone automatiquement. Ne PAS ajouter de
 * colonne de seuil par zone : elle dupliquerait une valeur 100 %
 * calculable et se désynchroniserait (audit A2).
 *
 * ⚠️ SÉPARATION VOLONTAIRE DES ASSIETTES — décision Augustin 24.07.2026,
 * NE PAS « UNIFIER » :
 *
 *   - Le SEUIL de livraison offerte se calcule sur le COMMANDÉ : sous-total
 *     marchandise AVANT remise promo, hors livraison. Raison : un code
 *     promo saisi au checkout ne doit JAMAIS faire retomber le panier sous
 *     le seuil sous les yeux du client (donné-repris visuel).
 *   - La FIDÉLITÉ (src/lib/loyalty/rule.ts) se calcule sur le PAYÉ :
 *     total_amount remisé. Raison : on ne récompense que ce qui est payé
 *     (faille des codes parrainage à −100 %).
 *
 * Le `min_order_amount` des zones joue DEUX rôles depuis la refonte :
 * le seuil pour ÊTRE LIVRÉ (garde du POST) ET la base du seuil de
 * gratuité (min + offset) — c'est le même « prix d'entrée » de la zone,
 * les deux montent ensemble avec la distance, c'est le design.
 *
 * ⭐ ZONE À FRAIS NUL (1012 Chailly, décision 4) : rien à offrir — le fee
 * effectif est 0 par construction et AUCUN palier ne doit s'afficher
 * (milestones.ts retourne null si zoneFee ≤ 0).
 */

export type FreeDeliveryRule = {
  enabled: boolean;
  /** OFFSET en CHF au-dessus du minimum de zone (seuil = min + offset). */
  offsetAboveZoneMin: number;
};

/** Valeurs par défaut = celles posées en base par ZL1. */
export const DEFAULT_FREE_DELIVERY_RULE: FreeDeliveryRule = {
  enabled: false,
  offsetAboveZoneMin: 15,
};

/** Lit une colonne numeric Supabase (souvent renvoyée en string). */
function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Assainit un enregistrement `restaurants` en FreeDeliveryRule utilisable.
 * `free_delivery_threshold` porte l'OFFSET depuis ZL1 (recyclage assumé —
 * le nom de colonne ment, le renommer serait du DDL pour rien).
 */
export function toFreeDeliveryRule(
  row: Record<string, unknown> | null | undefined,
): FreeDeliveryRule {
  if (!row) return DEFAULT_FREE_DELIVERY_RULE;
  const offset = num(row.free_delivery_threshold);
  return {
    enabled: row.free_delivery_enabled === true,
    offsetAboveZoneMin:
      offset > 0 ? offset : DEFAULT_FREE_DELIVERY_RULE.offsetAboveZoneMin,
  };
}

/** LE seuil de gratuité d'une zone — unique dérivation, jamais re-écrite
 * ailleurs. */
export function freeDeliveryThresholdForZone(
  zoneMinOrderAmount: number,
  rule: FreeDeliveryRule,
): number {
  return zoneMinOrderAmount + rule.offsetAboveZoneMin;
}

/**
 * LE prédicat « seuil franchi » — unique, partagé par le calcul du fee
 * (serveur ET client) et par l'affichage des paliers (milestones.ts).
 * Ne JAMAIS re-dériver cet état d'un autre calcul (ex. remaining === 0) :
 * deux expressions de la même décision finissent toujours par diverger
 * (relevé relecteur 28.07.2026 — résidu flottant sur les sommes de prix).
 */
export function isFreeDeliveryReached(
  subtotalGoods: number,
  zoneMinOrderAmount: number,
  rule: FreeDeliveryRule,
): boolean {
  // Tolérance d'un demi-centime (décision Augustin 29.07.2026) : les sommes
  // de prix ne sont pas représentables en binaire — un panier composé à
  // 40.00 pile peut valoir 39.999999999999993. Facturer la livraison sur un
  // résidu binaire serait indéfendable au comptoir. Le prédicat étant
  // UNIQUE, la tolérance s'applique partout d'un coup (serveur, client,
  // paliers).
  return (
    rule.enabled &&
    subtotalGoods >=
      freeDeliveryThresholdForZone(zoneMinOrderAmount, rule) - 0.005
  );
}

/**
 * Frais de livraison effectifs pour un panier donné. Calcul pur, sans effet
 * de bord — MÊME fonction côté serveur (POST /api/orders) et côté client
 * (affichage panier/checkout) : les deux ne peuvent pas diverger.
 *
 * @param subtotalGoods      sous-total marchandise AVANT remise (cf. en-tête)
 * @param zoneFee            frais de la zone de livraison qualifiée
 * @param zoneMinOrderAmount minimum de commande de la MÊME zone
 */
export function effectiveDeliveryFee(
  subtotalGoods: number,
  zoneFee: number,
  zoneMinOrderAmount: number,
  rule: FreeDeliveryRule,
): number {
  if (zoneFee <= 0) return 0; // zone à frais nul (Chailly) : rien à offrir
  return isFreeDeliveryReached(subtotalGoods, zoneMinOrderAmount, rule)
    ? 0
    : zoneFee;
}
