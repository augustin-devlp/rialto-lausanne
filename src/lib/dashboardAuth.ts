import crypto from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Session dashboard restaurateur — miroir du pattern scanAuth (PIN +
 * cookie HMAC signé httpOnly), avec PIN et secret DÉDIÉS : l'accès
 * patron est séparé de l'accès scan employés (deux cookies, deux
 * secrets, deux PIN — révocables indépendamment).
 *
 * Duplication assumée plutôt que factorisation : scanAuth reste
 * intouché (zéro risque de régression sur le flux comptoir).
 *
 * FAIL-FAST : si DASHBOARD_PIN ou DASHBOARD_COOKIE_SECRET manquent,
 * les routes répondent 500 { ok:false, error:"dashboard_not_configured" }.
 */

export const DASHBOARD_COOKIE_NAME = "rialto_dashboard_session";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

/** True si les secrets requis sont présents (sinon les routes 500). */
export function isDashboardConfigured(): boolean {
  return (
    Boolean(process.env.DASHBOARD_PIN) &&
    Boolean(process.env.DASHBOARD_COOKIE_SECRET)
  );
}

function sign(expiresMs: number, secret: string): string {
  return crypto
    .createHmac("sha256", secret)
    .update(String(expiresMs))
    .digest("hex");
}

export interface DashboardCookie {
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
 * Fabrique le cookie de session dashboard (30 jours). Suppose la config
 * valide : l'appelant a déjà vérifié isDashboardConfigured().
 */
export function createDashboardCookie(): DashboardCookie {
  const secret = process.env.DASHBOARD_COOKIE_SECRET as string;
  const expiresMs = Date.now() + THIRTY_DAYS_MS;
  const value = `${expiresMs}.${sign(expiresMs, secret)}`;
  return {
    name: DASHBOARD_COOKIE_NAME,
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
 * Vérifie une valeur de cookie : parse `<expiresMs>.<hmac>`, recompute
 * le HMAC, compare en timing-safe, contrôle la non-expiration.
 */
export function verifyDashboardCookie(
  value: string | undefined | null,
): boolean {
  if (!value) return false;
  const secret = process.env.DASHBOARD_COOKIE_SECRET;
  if (!secret) return false;

  const dot = value.indexOf(".");
  if (dot <= 0) return false;

  const expiresStr = value.slice(0, dot);
  const providedHmac = value.slice(dot + 1);

  const expiresMs = Number(expiresStr);
  if (!Number.isFinite(expiresMs) || expiresMs <= 0) return false;

  const expectedHmac = sign(expiresMs, secret);

  const a = Buffer.from(providedHmac, "hex");
  const b = Buffer.from(expectedHmac, "hex");
  if (a.length !== b.length || a.length === 0) return false;
  if (!crypto.timingSafeEqual(a, b)) return false;

  return Date.now() < expiresMs;
}

/** Lit le cookie de session de la requête et le valide → boolean. */
export function requireDashboardAuth(req: NextRequest): boolean {
  const cookie = req.cookies.get(DASHBOARD_COOKIE_NAME)?.value;
  return verifyDashboardCookie(cookie);
}
