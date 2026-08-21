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

/**
 * @deprecated Utiliser normalizePhone de "@/lib/phone" qui gère CH + FR +
 * détection auto. Conservé pour compatibilité legacy — redirige.
 */
export function sanitizePhoneCH(input: string): string {
  // Conservé pour les imports existants. En interne on bascule sur
  // la nouvelle fonction libphonenumber-based qui gère CH + FR.
  const cleaned = input.trim().replace(/[\s\-().]/g, "");
  return cleaned;
}
