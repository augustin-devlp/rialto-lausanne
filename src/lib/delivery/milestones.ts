/**
 * Moteur « distance au palier » (LS2, 24.07.2026) — conçu MULTI-PALIERS
 * dès le départ : la livraison offerte est le premier palier, l'upsell
 * fidélité (« plus que X CHF pour votre prochain tampon ») s'ajoutera ici
 * comme une nouvelle source, sans toucher aux surfaces d'affichage.
 *
 * PRINCIPE : chaque source calcule son palier sur SA PROPRE assiette (la
 * livraison offerte sur le COMMANDÉ avant remise — cf. delivery/rule.ts ;
 * la fidélité, plus tard, sur le PAYÉ). Ce module ne fait qu'agréger et
 * trier — il n'unifie JAMAIS les assiettes (décision Augustin 24.07.2026).
 *
 * Calcul pur, sans effet de bord : mêmes valeurs partout où un palier
 * s'affiche (panier, checkout).
 */

import { formatCHF } from "@/lib/format";
import { isFreeDeliveryReached, type FreeDeliveryRule } from "./rule";

export type MilestoneKey = "free_delivery"; // à étendre : | "next_stamp" ...

export type Milestone = {
  key: MilestoneKey;
  /** Seuil en CHF, sur l'assiette PROPRE à la source (cf. en-tête). */
  threshold: number;
  reached: boolean;
  /** Reste à ajouter pour franchir (0 si atteint). */
  remaining: number;
  labelPending: string;
  labelReached: string;
};

export function computeMilestones(
  subtotalGoods: number,
  sources: { freeDelivery?: FreeDeliveryRule | null },
): Milestone[] {
  const out: Milestone[] = [];

  const fd = sources.freeDelivery;
  if (fd?.enabled) {
    // `reached` = LE prédicat serveur (jamais re-dérivé de remaining).
    // `remaining` arrondi au centime SUPÉRIEUR : les sommes de prix ne sont
    // pas représentables en binaire — sans le ceil, un panier à 7e-15 CHF
    // du seuil afficherait « Plus que 0.00 CHF pour la livraison offerte »
    // (relevé relecteur 28.07.2026). Pire cas du ceil : 0.01, jamais 0.
    const reached = isFreeDeliveryReached(subtotalGoods, fd);
    const remaining = reached
      ? 0
      : Math.ceil((fd.threshold - subtotalGoods) * 100) / 100;
    out.push({
      key: "free_delivery",
      threshold: fd.threshold,
      reached,
      remaining,
      labelPending: `Plus que ${formatCHF(remaining)} pour la livraison offerte`,
      labelReached: "Livraison offerte ✓",
    });
  }

  // Paliers futurs : les pousser ici, chacun avec sa propre assiette.

  return out.sort((a, b) => a.threshold - b.threshold);
}
