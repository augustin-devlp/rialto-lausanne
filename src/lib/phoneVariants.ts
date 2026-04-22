/**
 * Utilitaires pour matcher un numéro de téléphone saisi par un user
 * contre une base historique où les formats peuvent être mixtes
 * (+41..., 41..., 07..., etc.). Miroir du fichier côté loyalty-cards
 * — la logique doit rester strictement identique.
 *
 * Phase 9 FIX 1/2.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";

export function phoneLookupVariants(raw: string): {
  variants: string[];
  digitsOnly: string;
  canonical: string | null;
} {
  const trimmed = (raw ?? "").trim().replace(/[\s\-().]/g, "");
  const digitsOnly = trimmed.replace(/[^\d]/g, "");

  const set = new Set<string>();
  if (trimmed) set.add(trimmed);
  if (digitsOnly) set.add(digitsOnly);

  const parsers = ["CH", "FR", undefined] as const;
  let canonical: string | null = null;

  for (const region of parsers) {
    const parsed = parsePhoneNumberFromString(
      trimmed,
      region as "CH" | "FR" | undefined,
    );
    if (parsed?.isValid()) {
      const e164 = parsed.format("E.164");
      const e164NoPlus = e164.replace(/^\+/, "");
      const national = parsed
        .format("NATIONAL")
        .replace(/[\s\-().]/g, "");
      set.add(e164);
      set.add(e164NoPlus);
      set.add(national);
      if (!canonical) canonical = e164;
      break;
    }
  }

  if (digitsOnly && !canonical) {
    if (digitsOnly.startsWith("41") || digitsOnly.startsWith("33")) {
      set.add(`+${digitsOnly}`);
    }
  }

  return { variants: Array.from(set), digitsOnly, canonical };
}

export function canonicalE164(raw: string): string | null {
  const parsers = ["CH", "FR", undefined] as const;
  const cleaned = (raw ?? "").trim().replace(/[\s\-().]/g, "");
  if (!cleaned) return null;
  for (const region of parsers) {
    const parsed = parsePhoneNumberFromString(
      cleaned,
      region as "CH" | "FR" | undefined,
    );
    if (parsed?.isValid()) return parsed.format("E.164");
  }
  return null;
}
