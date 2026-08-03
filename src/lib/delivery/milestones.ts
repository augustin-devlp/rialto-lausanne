/**
 * Palier « livraison offerte » (LS2, replié le 03.08.2026).
 *
 * HISTORIQUE : né « moteur multi-paliers » ; replié en fonction simple sur
 * relevé relecteur (les appelants faisaient tous `.find(clé fixe)` — dette
 * d'abstraction sans second consommateur). Le jour où l'upsell fidélité
 * (« plus que X CHF pour votre prochain tampon ») arrive (backlog v1.1),
 * re-généraliser — en gardant la règle ci-dessous.
 *
 * ⚠️ RÈGLE À CONSERVER lors de toute re-généralisation : chaque source de
 * palier calcule sur SA PROPRE assiette (livraison offerte = COMMANDÉ avant
 * remise, cf. delivery/rule.ts ; fidélité = PAYÉ). Ne JAMAIS unifier les
 * assiettes (décision Augustin 24.07.2026).
 *
 * Calcul pur : mêmes valeurs partout où le palier s'affiche (panier,
 * checkout).
 */

import { formatCHF } from "@/lib/format";
import { isFreeDeliveryReached, type FreeDeliveryRule } from "./rule";

export type Milestone = {
  /** Seuil en CHF, sur l'assiette propre à la source (cf. en-tête). */
  threshold: number;
  reached: boolean;
  /** Reste à ajouter pour franchir (0 si atteint). */
  remaining: number;
  labelPending: string;
  labelReached: string;
};

/** Null si la règle n'est pas chargée ou si le seuil est désactivé. */
export function getFreeDeliveryMilestone(
  subtotalGoods: number,
  rule: FreeDeliveryRule | null | undefined,
): Milestone | null {
  if (!rule?.enabled) return null;

  // `reached` = LE prédicat serveur (jamais re-dérivé de remaining).
  // `remaining` : normaliser au 1/100e de centime AVANT le ceil — un ceil
  // directement sur la différence flottante sur-corrige d'un centime sur
  // les paniers courants (prix en .90/.80 : 39.80 face au seuil 50
  // affichait « Plus que 10.21 CHF » au lieu de 10.20). Le plancher 0.01
  // garantit qu'un résidu à 7e-15 n'affiche jamais « Plus que 0.00 CHF ».
  // Formule re-vérifiée numériquement (relecture 28.07.2026) — ne PAS la
  // « simplifier » en Math.ceil(threshold - subtotal).
  const reached = isFreeDeliveryReached(subtotalGoods, rule);
  const remaining = reached
    ? 0
    : Math.max(
        0.01,
        Math.ceil(Math.round((rule.threshold - subtotalGoods) * 10000) / 100) /
          100,
      );

  return {
    threshold: rule.threshold,
    reached,
    remaining,
    labelPending: `Plus que ${formatCHF(remaining)} pour la livraison offerte`,
    labelReached: "Livraison offerte ✓",
  };
}
