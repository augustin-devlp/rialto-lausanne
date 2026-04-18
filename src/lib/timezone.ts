import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export const TIMEZONE = "Europe/Zurich";

/** "HH:mm" local Zurich time for a given instant. */
export function toZurichHHMM(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, "HH:mm");
}

/** "yyyy-MM-dd" Zurich date for a given instant. */
export function toZurichDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return formatInTimeZone(d, TIMEZONE, "yyyy-MM-dd");
}

/** Convert "HH:MM" (optionally "HH:MM:SS") to minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

/** Convert minutes since midnight to "HH:MM". */
export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Given a "HH:mm" Zurich time, return the UTC Date instant for that local
 * time on the soonest matching day (today if still in future, otherwise
 * tomorrow).
 */
export function pickupFromZurichHHMM(hhmm: string, now: Date = new Date()): Date {
  const todayZurich = toZurichDate(now);
  let candidate = fromZonedTime(`${todayZurich} ${hhmm}:00`, TIMEZONE);
  if (candidate.getTime() <= now.getTime()) {
    const t = new Date(now);
    t.setUTCDate(t.getUTCDate() + 1);
    const tomorrowZurich = toZurichDate(t);
    candidate = fromZonedTime(`${tomorrowZurich} ${hhmm}:00`, TIMEZONE);
  }
  return candidate;
}
