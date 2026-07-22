/**
 * Barème de fidélité — LA formule, à un seul endroit au monde (F1, 22.07.2026).
 *
 * Importée par le calcul du PENDING (affichage client) et, en F3, par la
 * SOLIDIFICATION (écriture du tampon acquis) : les deux ne peuvent
 * structurellement pas diverger.
 *
 * Réglages portés par loyalty_cards (migration F0/M1) :
 *   stamp_credit_mode   'per_amount' | 'per_order'
 *   stamp_amount_step   la tranche en CHF (défaut 50.00)
 *   stamp_amount_basis  'goods' (total - livraison) | 'total'
 *   stamp_max_per_order plafond de tampons par commande (défaut 2)
 *   stamp_online_enabled killswitch
 *
 * ⚠️ stampsForOrder() fait le CALCUL PUR et ignore volontairement le
 * killswitch : il sert aussi à la prévisualisation du dashboard, qui doit
 * montrer ce que le barème DONNERAIT. Le killswitch est appliqué par les
 * appelants qui produisent un effet visible ou une écriture (computePending
 * en F2, la solidification en F3).
 */

export type StampRule = {
  mode: "per_amount" | "per_order";
  step: number;
  basis: "goods" | "total";
  maxPerOrder: number;
  enabled: boolean;
};

/** Valeurs par défaut = celles posées en base par F0/M1. */
export const DEFAULT_STAMP_RULE: StampRule = {
  mode: "per_amount",
  step: 50,
  basis: "goods",
  maxPerOrder: 2,
  enabled: false,
};

/** Ligne de commande minimale nécessaire au calcul. */
export type StampableOrder = {
  total_amount: number | string;
  delivery_fee?: number | string | null;
};

/** Lit une colonne numeric Supabase (souvent renvoyée en string). */
function num(v: number | string | null | undefined): number {
  const n = typeof v === "string" ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Assainit un enregistrement loyalty_cards en StampRule utilisable.
 * Tolère les colonnes absentes (avant F0) en retombant sur les défauts.
 */
export function toStampRule(row: Record<string, unknown> | null | undefined): StampRule {
  if (!row) return DEFAULT_STAMP_RULE;
  const mode = row.stamp_credit_mode === "per_order" ? "per_order" : "per_amount";
  const basis = row.stamp_amount_basis === "total" ? "total" : "goods";
  const step = num(row.stamp_amount_step as number | string | null);
  const max = Math.trunc(num(row.stamp_max_per_order as number | string | null));
  return {
    mode,
    basis,
    step: step > 0 ? step : DEFAULT_STAMP_RULE.step,
    maxPerOrder: max >= 1 ? max : DEFAULT_STAMP_RULE.maxPerOrder,
    enabled: row.stamp_online_enabled === true,
  };
}

/**
 * Nombre de tampons que VAUT une commande selon le barème.
 * Calcul pur, sans effet de bord, testable sans base.
 *
 *   base = basis === 'goods' ? total_amount - delivery_fee : total_amount
 *   n    = mode === 'per_order' ? 1 : min(floor(base / step), maxPerOrder)
 *
 * Sous la tranche (ex. 49 CHF pour une tranche de 50) → 0 tampon : décision
 * produit assumée du 22.07 (pas d'hybride « minimum 1 », qui rendrait le
 * barème illisible).
 */
export function stampsForOrder(order: StampableOrder, rule: StampRule): number {
  const total = num(order.total_amount);
  const fee = num(order.delivery_fee);
  const base = rule.basis === "goods" ? total - fee : total;
  if (!(base > 0)) return 0;

  if (rule.mode === "per_order") {
    return Math.min(1, rule.maxPerOrder);
  }
  if (!(rule.step > 0)) return 0;
  return Math.max(0, Math.min(Math.floor(base / rule.step), rule.maxPerOrder));
}
