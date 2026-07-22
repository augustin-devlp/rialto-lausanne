/**
 * Libellés du barème de fidélité — SOURCE UNIQUE (F1, 22.07.2026).
 *
 * Aujourd'hui : utilisé par l'écran de réglage du dashboard (prévisualisation).
 * En F4 : les ~10 chaînes en dur côté client (« 10 commandes = 1 pizza
 * offerte », etc.) passeront toutes par ici, sinon la copie se refige et
 * redevient fausse dès que le restaurateur change le barème.
 *
 * Vouvoiement pour tout texte client (règle projet).
 */

import type { StampRule } from "./rule";

/** Montant formaté en CHF, sans décimales inutiles (50 / 47.50). */
export function chf(n: number): string {
  return Number.isInteger(n) ? `${n} CHF` : `${n.toFixed(2)} CHF`;
}

/**
 * Comment on gagne un tampon. Ex. :
 *   « 1 tampon par tranche de 50 CHF »
 *   « 1 tampon par commande »
 */
export function formatStampRule(rule: StampRule): string {
  return rule.mode === "per_order"
    ? "1 tampon par commande"
    : `1 tampon par tranche de ${chf(rule.step)}`;
}

/** Précision sur l'assiette de calcul, pour les écrans qui doivent être exacts. */
export function formatStampBasis(rule: StampRule): string {
  if (rule.mode === "per_order") return "quel que soit le montant";
  return rule.basis === "goods"
    ? "hors frais de livraison"
    : "frais de livraison compris";
}

/** Phrase complète pour le client. */
export function formatStampRuleLong(rule: StampRule): string {
  if (rule.mode === "per_order") return "Chaque commande vous rapporte 1 tampon.";
  const plafond =
    rule.maxPerOrder > 1
      ? ` (jusqu'à ${rule.maxPerOrder} tampons par commande)`
      : "";
  return `Vous gagnez 1 tampon par tranche de ${chf(rule.step)} ${formatStampBasis(
    rule,
  )}${plafond}.`;
}

/** Objectif de la carte. Ex. « 10 tampons = Une pizza offerte ». */
export function formatCardGoal(
  stampsRequired: number,
  rewardDescription: string,
): string {
  return `${stampsRequired} tampons = ${rewardDescription}`;
}
