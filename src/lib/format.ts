import { hhmmToMinutes, minutesToHHMM, toZurichHHMM } from "./timezone";

export function formatCHF(amount: number): string {
  return `${amount.toFixed(2)} CHF`;
}

/** Vrai si "now" est dans la plage [open, close] au sens Europe/Zurich. */
export function isOpenNow(
  openTime: string,
  closeTime: string,
  now: Date = new Date(),
): boolean {
  const nowMin = hhmmToMinutes(toZurichHHMM(now));
  return (
    nowMin >= hhmmToMinutes(openTime) && nowMin <= hhmmToMinutes(closeTime)
  );
}

/**
 * Slots de retrait en "HH:MM" Europe/Zurich, de max(ouverture, now+prep)
 * arrondi au quart d'heure suivant, jusqu'à l'heure de fermeture.
 * Retourne [] si la fenêtre est fermée (après close, ou prep dépasse close).
 */
export function buildPickupTimeSlots(
  openTime: string,
  closeTime: string,
  prepMinutes: number,
  now: Date = new Date(),
): string[] {
  const earliestHHMM = toZurichHHMM(
    new Date(now.getTime() + prepMinutes * 60_000),
  );
  const openMin = hhmmToMinutes(openTime);
  const closeMin = hhmmToMinutes(closeTime);
  const earliestMin = hhmmToMinutes(earliestHHMM);

  // Point de départ = max(ouverture, earliest) arrondi au 15 min suivant
  let start = Math.max(openMin, earliestMin);
  start = Math.ceil(start / 15) * 15;

  const slots: string[] = [];
  for (let t = start; t <= closeMin; t += 15) {
    slots.push(minutesToHHMM(t));
  }
  return slots;
}

export function cartItemKey(
  itemId: string,
  options: { group: string; name: string }[],
  notes: string,
): string {
  const opt = options
    .map((o) => `${o.group}:${o.name}`)
    .sort()
    .join("|");
  return `${itemId}::${opt}::${notes}`;
}

export function sanitizePhoneCH(input: string): string {
  const digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+41" + digits.slice(1);
  return digits;
}
