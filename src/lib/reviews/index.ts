/**
 * Sélecteur de mode du gate avis (14.08.2026).
 *
 * REVIEW_GATE_MODE (serveur) + NEXT_PUBLIC_REVIEW_GATE_MODE (même valeur,
 * pour que l'UI choisisse son flux) :
 *   - 'declarative' (DÉFAUT, mode ACTIF aujourd'hui) : le flux honor-based
 *     existant (verify-review-degraded) reste en place, les routes de
 *     vérification API répondent 503 « en préparation ».
 *   - 'api'  : vérification réelle par la Business Profile API.
 *   - 'mock' : provider simulé (préprod/QA uniquement).
 *
 * BASCULE JOUR J (une fois l'accès Google obtenu) : poser les 4 env GBP_*
 * + REVIEW_GATE_MODE=api + NEXT_PUBLIC_REVIEW_GATE_MODE=api + exécuter la
 * migration RV1b (navette) si pas déjà fait + redeploy. RIEN d'autre —
 * cf. docs/REVIEW_GATE.md.
 */

import type { ReviewProvider } from "./provider";
import { GoogleReviewProvider } from "./googleProvider";
import { MockReviewProvider } from "./mockProvider";

export type ReviewGateMode = "declarative" | "api" | "mock";

export function reviewGateMode(): ReviewGateMode {
  const m = process.env.REVIEW_GATE_MODE;
  return m === "api" || m === "mock" ? m : "declarative";
}

/** null en mode déclaratif : aucun provider ne doit être appelé. */
export function reviewProvider(): ReviewProvider | null {
  switch (reviewGateMode()) {
    case "api":
      return new GoogleReviewProvider();
    case "mock":
      return new MockReviewProvider();
    default:
      return null;
  }
}
