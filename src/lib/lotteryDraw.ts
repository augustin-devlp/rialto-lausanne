import crypto from "node:crypto";

/**
 * Helpers du tirage loterie (D2 dashboard).
 */

/** 1er jour du mois COURANT en Europe/Zurich, au format date "YYYY-MM-01". */
export function zurichMonthStart(): string {
  const parts = new Intl.DateTimeFormat("fr-CH", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  return `${y}-${m}-01`;
}

/** Libellé humain d'un mois "YYYY-MM-01" → "juillet 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("fr-CH", {
    timeZone: "Europe/Zurich",
    month: "long",
    year: "numeric",
  });
}

/**
 * Génère un code de retrait depuis le template DB de la loterie
 * (défaut 'RIALTO-WIN-{RANDOM6}'). {RANDOM6} → 6 caractères A-Z/2-9
 * (alphabet sans ambiguïté 0/O, 1/I).
 */
export function generateClaimToken(template: string | null): string {
  const tpl = template || "RIALTO-WIN-{RANDOM6}";
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return tpl.replace(/\{RANDOM(\d+)\}/gi, (_, len: string) => {
    let out = "";
    const n = Math.min(Number(len) || 6, 32);
    for (let i = 0; i < n; i++) {
      out += alphabet[crypto.randomInt(alphabet.length)];
    }
    return out;
  });
}

/** Masque un téléphone pour l'affichage patron : +41791234567 → +41 79 ••• 67 */
export function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return phone;
  return `${phone.slice(0, 5)} ••• ${phone.slice(-2)}`;
}

/** True si l'erreur PostgREST correspond à « table absente » (migration en attente). */
export function isMissingTableError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42P01" ||
    (typeof e.message === "string" && e.message.includes("lottery_draws"))
  );
}
