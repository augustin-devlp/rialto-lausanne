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
import type { FreeDeliveryRule } from "./rule";

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
    const remaining = Math.max(0, fd.threshold - subtotalGoods);
    out.push({
      key: "free_delivery",
      threshold: fd.threshold,
      reached: remaining === 0,
      remaining,
      labelPending: `Plus que ${formatCHF(remaining)} pour la livraison offerte`,
      labelReached: "Livraison offerte ✓",
    });
  }

  // Paliers futurs : les pousser ici, chacun avec sa propre assiette.

  return out.sort((a, b) => a.threshold - b.threshold);
}
