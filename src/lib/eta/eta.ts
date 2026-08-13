/**
 * Moteur ETA — LA formule, à un seul endroit (chantier statuts, 08.08.2026).
 *
 * Calcul PUR, zéro I/O : mêmes valeurs partout où un délai s'affiche
 * (checkout, page de suivi, menu). Le serveur fournit les INTRANTS
 * (compteurs, minutes de zone, heure d'acceptation), ce module fait tout
 * le calcul — côté client comme côté serveur, sans divergence possible.
 *
 * Réconcilie l'ancien prepTime.ts (jamais branché, absorbé ici) : base
 * cuisine par mode + rush Europe/Zurich + trajet de zone, ENRICHI de la
 * file (arbitrage +4 min/commande, plafonné 20) et de l'occupation
 * livreur (livraisons en course × aller-retour moyen, plafonné).
 * Toutes les valeurs de calibrage vivent dans ./constants.ts.
 */

import {
  QUEUE_MIN_PER_ORDER,
  QUEUE_BONUS_CAP_MIN,
  COURIER_AVG_ONE_WAY_MIN,
  COURIER_ROUND_TRIP_FACTOR,
  COURIER_BONUS_CAP_MIN,
  RUSH_WINDOWS,
  RUSH_BONUS_DELIVERY_MIN,
  RUSH_BONUS_PICKUP_MIN,
  TRAVEL_OVERLAP_DEDUCTION_MIN,
  RANGE_SPREAD_MIN,
  ROUND_TO_MIN,
  DISPLAY_CAP_MIN,
  NEAR_WINDOW_MIN,
} from "./constants";

export type EtaInput = {
  fulfillmentType: "pickup" | "delivery";
  /** Base cuisine : delivery_prep_time_minutes ou pickup_prep_time_minutes. */
  prepBaseMinutes: number;
  /** delivery_zones.estimated_delivery_minutes (0/absent en pickup). */
  zoneMinutes?: number | null;
  /** Commandes actives DEVANT celle-ci (checkout : toutes les actives). */
  queueAhead: number;
  /** Livraisons réputées en course (proxy serveur). */
  inCourse: number;
  now: Date;
};

export type EtaRange = {
  /** Bornes en minutes, arrondies, AVANT plafond d'affichage. */
  minMinutes: number;
  maxMinutes: number;
  /** Part cuisine seule (sert au découpage des phases du suivi). */
  kitchenMinutes: number;
  /** Vrai si la fourchette dépasse le plafond « moins d'1h ». */
  capped: boolean;
};

function estRush(now: Date): boolean {
  const h = parseInt(
    now.toLocaleString("en-US", {
      timeZone: "Europe/Zurich",
      hour: "2-digit",
      hour12: false,
    }),
    10,
  );
  return RUSH_WINDOWS.some(([debut, fin]) => h >= debut && h < fin);
}

function arrondi(minutes: number): number {
  return Math.max(
    ROUND_TO_MIN,
    Math.round(minutes / ROUND_TO_MIN) * ROUND_TO_MIN,
  );
}

export function computeEtaRange(input: EtaInput): EtaRange {
  const rush = estRush(input.now)
    ? input.fulfillmentType === "delivery"
      ? RUSH_BONUS_DELIVERY_MIN
      : RUSH_BONUS_PICKUP_MIN
    : 0;

  const queue = Math.min(
    input.queueAhead * QUEUE_MIN_PER_ORDER,
    QUEUE_BONUS_CAP_MIN,
  );

  // La cuisine : base + file + rush — c'est la fenêtre « En préparation ».
  const kitchen = input.prepBaseMinutes + queue + rush;

  const travel =
    input.fulfillmentType === "delivery"
      ? Math.max(0, (input.zoneMinutes ?? 30) - TRAVEL_OVERLAP_DEDUCTION_MIN)
      : 0;

  const courier =
    input.fulfillmentType === "delivery"
      ? Math.min(
          input.inCourse * COURIER_AVG_ONE_WAY_MIN * COURIER_ROUND_TRIP_FACTOR,
          COURIER_BONUS_CAP_MIN,
        )
      : 0;

  const total = kitchen + travel + courier;
  const minMinutes = arrondi(total);
  const maxMinutes = arrondi(total + RANGE_SPREAD_MIN);

  return {
    minMinutes,
    maxMinutes,
    kitchenMinutes: kitchen,
    capped: maxMinutes > DISPLAY_CAP_MIN,
  };
}

/**
 * Libellé d'une fourchette AVANT acceptation / au checkout :
 * « 35–45 min » ou « moins d'1h ». Jamais de minute précise.
 */
export function formatEtaRange(range: EtaRange): string {
  if (range.capped) return "moins d'1h";
  if (range.minMinutes === range.maxMinutes) return `~${range.minMinutes} min`;
  return `${range.minMinutes}–${range.maxMinutes} min`;
}

/**
 * Libellé du RESTANT sur la page de suivi : fourchette prudente loin de
 * l'échéance, « ~X min » quand elle approche (resserrage), « imminente »
 * sous 5 min.
 */
export function formatEtaRemaining(remainingMinutes: number): string {
  if (remainingMinutes <= ROUND_TO_MIN) return "d'une minute à l'autre";
  if (remainingMinutes <= NEAR_WINDOW_MIN) {
    return `~${arrondi(remainingMinutes)} min`;
  }
  const min = arrondi(remainingMinutes);
  const max = arrondi(remainingMinutes + RANGE_SPREAD_MIN);
  if (max > DISPLAY_CAP_MIN) return "moins d'1h";
  return `${min}–${max} min`;
}
