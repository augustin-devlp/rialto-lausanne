import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Session de scan signée HMAC — zéro dépendance externe (node:crypto).
 *
 * Le cookie `rialto_scan_session` porte une valeur `<expiresMs>.<hmac>` où
 * `hmac = HMAC-SHA256(SCAN_COOKIE_SECRET, String(expiresMs))` en hex.
 * Le cookie est httpOnly : illisible en JS côté client (le front interroge
 * GET /api/scan/login pour savoir s'il faut afficher l'écran PIN).
 *
 * FAIL-FAST : si SCAN_PIN ou SCAN_COOKIE_SECRET manquent, la config est
 * considérée incomplète — les routes répondent 500 { ok:false,
 * error:"scan_not_configured" } (jamais de fallback silencieux).
 */

export const SCAN_COOKIE_NAME = "rialto_scan_session";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

/** True si les secrets requis sont présents (sinon les routes 500). */
export function isScanConfigured(): boolean {
  return Boolean(process.env.SCAN_PIN) && Boolean(process.env.SCAN_COOKIE_SECRET);
}

function sign(expiresMs: number, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(String(expiresMs))
    .digest("hex");
}

export interface ScanCookie {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
}

/**
 * Fabrique le cookie de session scan (30 jours). Suppose la config valide :
 * l'appelant a déjà vérifié isScanConfigured().
 */
export function createScanCookie(): ScanCookie {
  const secret = process.env.SCAN_COOKIE_SECRET as string;
  const expiresMs = Date.now() + THIRTY_DAYS_MS;
  const value = `${expiresMs}.${sign(expiresMs, secret)}`;
  return {
    name: SCAN_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: THIRTY_DAYS_SEC,
    },
  };
}

/**
 * Vérifie une valeur de cookie : parse `<expiresMs>.<hmac>`, recompute le
 * HMAC, compare en timing-safe, contrôle la non-expiration.
 */
export function verifyScanCookie(value: string | undefined | null): boolean {
  if (!value) return false;
  const secret = process.env.SCAN_COOKIE_SECRET;
  if (!secret) return false;

  const dot = value.indexOf(".");
  if (dot <= 0) return false;

  const expiresStr = value.slice(0, dot);
  const providedHmac = value.slice(dot + 1);

  const expiresMs = Number(expiresStr);
  if (!Number.isFinite(expiresMs) || expiresMs <= 0) return false;

  const expectedHmac = sign(expiresMs, secret);

  // Comparaison timing-safe : les buffers doivent avoir la même longueur.
  const a = Buffer.from(providedHmac, "hex");
  const b = Buffer.from(expectedHmac, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  // Signature valide → vérifier l'expiration.
  return Date.now() < expiresMs;
}

/** Lit le cookie de session de la requête et le valide → boolean. */
export function requireScanAuth(req: NextRequest): boolean {
  const cookie = req.cookies.get(SCAN_COOKIE_NAME)?.value;
  return verifyScanCookie(cookie);
}
