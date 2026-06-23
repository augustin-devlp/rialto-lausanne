/**
 * Calcule le temps de préparation dynamique selon la charge, l'heure,
 * et le type (pickup ou delivery). Utilisé côté Stampify (API) et le
 * même calcul peut être dupliqué côté Rialto pour afficher en temps
 * réel dans le CheckoutForm.
 */
export type FulfillmentType = "pickup" | "delivery";

export type RestaurantPrepConfig = {
  pickup_prep_time_minutes: number;
  delivery_prep_time_minutes: number;
};

/**
 * Heure courante à Zurich (0-23) — utilisé pour détecter les heures de
 * pointe du service.
 */
function getZurichHour(now: Date = new Date()): number {
  const s = now.toLocaleString("en-US", {
    timeZone: "Europe/Zurich",
    hour: "2-digit",
    hour12: false,
  });
  // "14" → 14, "09" → 9
  return parseInt(s, 10);
}

export function calculatePrepTime(
  fulfillmentType: FulfillmentType,
  activeOrdersCount: number,
  restaurant: RestaurantPrepConfig,
  deliveryZoneEta?: number,
  now: Date = new Date(),
): { minutes: number; label: string } {
  const base =
    fulfillmentType === "pickup"
      ? restaurant.pickup_prep_time_minutes
      : restaurant.delivery_prep_time_minutes;

  // Bonus selon la charge en cuisine
  let chargeBonus = 0;
  if (fulfillmentType === "pickup") {
    if (activeOrdersCount <= 2) chargeBonus = 0;
    else if (activeOrdersCount <= 4) chargeBonus = 5;
    else if (activeOrdersCount <= 6) chargeBonus = 15;
    else if (activeOrdersCount <= 8) chargeBonus = 20;
    else chargeBonus = 30;
  } else {
    if (activeOrdersCount <= 2) chargeBonus = 0;
    else if (activeOrdersCount <= 4) chargeBonus = 15;
    else if (activeOrdersCount <= 6) chargeBonus = 30;
    else chargeBonus = 45;
  }

  // Heures de pointe (Europe/Zurich) : 12h-14h et 19h-21h
  const h = getZurichHour(now);
  const isRush = (h >= 12 && h < 14) || (h >= 19 && h < 21);
  const rushBonus = isRush ? (fulfillmentType === "pickup" ? 5 : 10) : 0;

  // Temps de déplacement du livreur (pour delivery uniquement)
  // On soustrait 15 min pour éviter le double compte avec la prep.
  const travelTime =
    fulfillmentType === "delivery"
      ? Math.max(0, (deliveryZoneEta ?? 30) - 15)
      : 0;

  const total = base + chargeBonus + rushBonus + travelTime;

  return {
    minutes: total,
    label: `Prêt${fulfillmentType === "delivery" ? " et livré" : ""} en ~${total} min`,
  };
}
