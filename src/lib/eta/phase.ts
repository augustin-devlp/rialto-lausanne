/**
 * Phase de suivi DÉRIVÉE — le « moteur de statuts » (08.08.2026).
 *
 * AUCUNE écriture : la phase affichée au client est f(statut réel en
 * base, heure d'acceptation, ETA, maintenant) — même pattern que le
 * tampon en attente. La base ne stocke que la vérité (new/accepted/
 * cancelled + timestamps du trigger order_status_history).
 *
 * Deux sources se superposent, la plus AVANCÉE gagne :
 *   1. le TEMPS : acceptée depuis t → Confirmée (< CONFIRMED_PHASE_MIN),
 *      puis En préparation (< fenêtre cuisine), puis En livraison,
 *      puis Livrée (ETA max écoulé) ;
 *   2. le STATUT réel s'il est plus avancé (si la caisse écrit un jour
 *      preparing/ready/completed, on les respecte — plancher, jamais
 *      contredit par l'horloge).
 *
 * Retrait (pickup) : Confirmée → En préparation → Prête (pas de phase
 * livraison, la commande reste « Prête » — pas d'auto-« Récupérée »).
 * AUCUN SMS, AUCUN bouton : les templates order_preparing/order_ready
 * restent INACTIFS (documenté dans docs/SMS_TEMPLATES.md).
 */

import { CONFIRMED_PHASE_MIN } from "./constants";
import type { EtaRange } from "./eta";

export type PhaseKey =
  | "waiting" // status new — pas encore confirmée par le restaurant
  | "confirmed"
  | "preparing"
  | "delivering" // delivery uniquement
  | "ready" // pickup uniquement (terminal côté suivi)
  | "delivered" // delivery : ETA écoulé ou status completed
  | "cancelled";

export type DerivedPhase = {
  key: PhaseKey;
  /** Index dans le stepper (0-based) ; -1 pour cancelled. */
  stepIndex: number;
  /** Minutes restantes estimées avant la fin (null si sans objet). */
  remainingMinutes: number | null;
};

const MIN_MS = 60_000;

/** Plancher issu du statut réel : jamais moins avancé que la base. */
function plancherStatut(
  status: string,
  fulfillment: "pickup" | "delivery",
): PhaseKey | null {
  switch (status) {
    case "preparing":
      return "preparing";
    case "ready":
      return fulfillment === "delivery" ? "delivering" : "ready";
    case "completed":
      return fulfillment === "delivery" ? "delivered" : "ready";
    default:
      return null;
  }
}

export const ORDRE: Record<PhaseKey, number> = {
  waiting: 0,
  confirmed: 1,
  preparing: 2,
  delivering: 3,
  ready: 3,
  delivered: 4,
  cancelled: -1,
};

export function derivePhase(input: {
  status: string;
  fulfillmentType: "pickup" | "delivery";
  /** ISO — MIN(changed_at) new→accepted du trigger ; null si jamais acceptée. */
  acceptedAt: string | null;
  eta: EtaRange | null;
  now: Date;
}): DerivedPhase {
  const { status, fulfillmentType, acceptedAt, eta, now } = input;

  if (status === "cancelled") {
    return { key: "cancelled", stepIndex: -1, remainingMinutes: null };
  }
  if (status === "new" || !acceptedAt || !eta) {
    // Pas (encore) acceptée, ou intrants pas encore chargés (SSR initial
    // sans eta) : on reste sur l'étape d'attente / le statut brut.
    const plancher = plancherStatut(status, fulfillmentType);
    if (plancher) return finalise(plancher, fulfillmentType, null);
    return {
      key: status === "accepted" ? "confirmed" : "waiting",
      stepIndex: status === "accepted" ? 1 : 0,
      remainingMinutes: null,
    };
  }

  const acceptedMs = new Date(acceptedAt).getTime();
  if (!Number.isFinite(acceptedMs)) {
    // acceptedAt non parsable : NaN ferait basculer toutes les
    // comparaisons en « Livrée » immédiate et afficher « NaN–NaN min »
    // (relevé relecteur 13.08). On retombe sur le statut brut.
    return {
      key: "confirmed",
      stepIndex: 1,
      remainingMinutes: null,
    };
  }
  // Math.max(0, …) : une horloge client en retard donnerait un elapsed
  // négatif — phase bloquée et restant gonflé sinon.
  const elapsedMin = Math.max(0, (now.getTime() - acceptedMs) / MIN_MS);
  // Cible du compte à rebours : en retrait, tout se joue à la fin de la
  // fenêtre cuisine (la bascule « Prête ») — décompter vers maxMinutes
  // ferait passer de « ~10 min » à « Prête » d'un coup, 10 min avant
  // l'échéance annoncée (relevé relecteur 13.08).
  const finMax =
    fulfillmentType === "pickup" ? eta.kitchenMinutes : eta.maxMinutes;
  const remaining = Math.max(0, finMax - elapsedMin);

  // Dérivation temporelle. La frontière « En préparation » →
  // « En livraison » est le DÉPART estimé (max(cuisine, retour livreur),
  // eta.departMinutes) — pas la fin de cuisine seule : quand le livreur
  // est en course, la pizza attend sur le comptoir et la commande est
  // toujours « En préparation » aux yeux du client (relecture 18.08).
  let horloge: PhaseKey;
  if (elapsedMin < CONFIRMED_PHASE_MIN) {
    horloge = "confirmed";
  } else if (
    elapsedMin <
    (fulfillmentType === "pickup" ? eta.kitchenMinutes : eta.departMinutes)
  ) {
    horloge = "preparing";
  } else if (fulfillmentType === "pickup") {
    horloge = "ready";
  } else if (elapsedMin < finMax) {
    horloge = "delivering";
  } else {
    horloge = "delivered";
  }

  // Plancher du statut réel : le plus avancé des deux gagne.
  const plancher = plancherStatut(status, fulfillmentType);
  const key =
    plancher && ORDRE[plancher] > ORDRE[horloge] ? plancher : horloge;

  return finalise(key, fulfillmentType, key === "delivered" ? null : remaining);
}

function finalise(
  key: PhaseKey,
  fulfillment: "pickup" | "delivery",
  remainingMinutes: number | null,
): DerivedPhase {
  // Stepper : delivery = attente/confirmée/préparation/livraison/livrée ;
  // pickup = attente/confirmée/préparation/prête.
  const index =
    key === "cancelled"
      ? -1
      : key === "ready" && fulfillment === "pickup"
        ? 3
        : ORDRE[key];
  return { key, stepIndex: index, remainingMinutes };
}
