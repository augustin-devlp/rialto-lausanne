/**
 * Livraison offerte à partir d'un seuil — LA règle, à un seul endroit
 * (LS1, 24.07.2026). Colonnes portées par `restaurants` (migration LS0).
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
 * Les deux règles regardent donc le même panier avec deux lunettes
 * différentes, et c'est voulu : le seuil INCITE sur ce que le client
 * commande, la fidélité RÉCOMPENSE ce qu'il paie. Conséquence assumée
 * (v1 sans garde) : un code −100 % sur un gros panier cumule commande
 * gratuite ET livraison offerte — rare, garde d'une ligne si abus constaté.
 *
 * Le `min_order_amount` des zones reste indépendant : c'est le seuil pour
 * ÊTRE LIVRÉ, celui-ci est le seuil pour ne pas payer la livraison.
 */

export type FreeDeliveryRule = {
  enabled: boolean;
  /** Seuil en CHF sur le sous-total marchandise avant remise. */
  threshold: number;
};

/** Valeurs par défaut = celles posées en base par LS0. */
export const DEFAULT_FREE_DELIVERY_RULE: FreeDeliveryRule = {
  enabled: false,
  threshold: 50,
};

/** Lit une colonne numeric Supabase (souvent renvoyée en string). */
function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Assainit un enregistrement `restaurants` en FreeDeliveryRule utilisable.
 * Tolère les colonnes absentes (avant LS0) en retombant sur les défauts.
 */
export function toFreeDeliveryRule(
  row: Record<string, unknown> | null | undefined,
): FreeDeliveryRule {
  if (!row) return DEFAULT_FREE_DELIVERY_RULE;
  const threshold = num(row.free_delivery_threshold);
  return {
    enabled: row.free_delivery_enabled === true,
    threshold: threshold > 0 ? threshold : DEFAULT_FREE_DELIVERY_RULE.threshold,
  };
}

/**
 * Frais de livraison effectifs pour un panier donné. Calcul pur, sans effet
 * de bord — MÊME fonction côté serveur (POST /api/orders) et côté client
 * (affichage panier/checkout, LS2) : les deux ne peuvent pas diverger.
 *
 * @param subtotalGoods sous-total marchandise AVANT remise promo (cf. en-tête)
 * @param zoneFee       frais de la zone de livraison qualifiée
 */
export function effectiveDeliveryFee(
  subtotalGoods: number,
  zoneFee: number,
  rule: FreeDeliveryRule,
): number {
  if (rule.enabled && subtotalGoods >= rule.threshold) return 0;
  return zoneFee;
}
