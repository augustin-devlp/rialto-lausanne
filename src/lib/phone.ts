import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * Normalise un numéro en E.164 (ex: "+41791234567", "+33612345678").
 * Retourne null si invalide.
 *
 * Détection : CH en priorité (clientèle locale), fallback FR puis
 * interprétation internationale.
 */
export function normalizePhone(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().replace(/[\s\-().]/g, "");
  if (!cleaned) return null;

  // Essaie Suisse d'abord (client principal de Rialto)
  let parsed = parsePhoneNumberFromString(cleaned, "CH");
  if (parsed?.isValid()) return parsed.number;

  // Fallback France
  parsed = parsePhoneNumberFromString(cleaned, "FR");
  if (parsed?.isValid()) return parsed.number;

  // International direct (pour un numéro déjà en E.164 type +49..., +44...)
  parsed = parsePhoneNumberFromString(cleaned);
  if (parsed?.isValid()) return parsed.number;

  return null;
}

/**
 * Format d'affichage joli pour un numéro E.164.
 * Ex: "+41791234567" → "+41 79 123 45 67"
 */
export function formatPhoneDisplay(e164: string): string {
  const parsed = parsePhoneNumberFromString(e164);
  return parsed?.formatInternational() ?? e164;
}
