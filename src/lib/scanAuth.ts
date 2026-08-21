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

/**
 * ⚠️ SESSION RAMENÉE DE 30 À 7 JOURS (Augustin, 22.08.2026).
 *
 * Raison : une session de scan valide permet de CRÉDITER DES TAMPONS
 * (`/api/scan/credit`). Trente jours d'accès pour un PIN deviné, c'est
 * trop cher payé.
 *
 * ⚠️ CONTREPARTIE OPÉRATIONNELLE, ET ELLE EST LA CONDITION DU
 * RACCOURCISSEMENT : passer de 30 à 7 jours multiplie par QUATRE les
 * occasions de reproduire le pire blocage du produit — session tombée,
 * écran de connexion, et plus personne au comptoir ne connaît le code.
 * Le PIN est donc écrit sur la MÊME carte plastifiée que les identifiants
 * de la caisse, sous le comptoir, et l'écran de connexion RENVOIE À CETTE
 * CARTE (`src/app/scan/ScanClient.tsx`, composant `PinForm`).
 * 🔴 NE PAS RACCOURCIR DAVANTAGE SANS RE-DISCUTER DE LA CARTE.
 */
const SEPT_JOURS_MS = 7 * 24 * 60 * 60 * 1000;
const SEPT_JOURS_SEC = 7 * 24 * 60 * 60;

/** True si les secrets requis sont présents (sinon les routes 500). */
export function isScanConfigured(): boolean {
  return Boolean(process.env.SCAN_PIN) && Boolean(process.env.SCAN_COOKIE_SECRET);
}

/**
 * Vérifie le PIN de scan, en TEMPS CONSTANT.
 *
 * ⚠️ CETTE GARDE VIT ICI, PAS CHEZ L'APPELANT — règle gravée du projet.
 * Elle était écrite `pin !== process.env.SCAN_PIN` DANS le handler de
 * `/api/scan/login` : une comparaison de chaînes JS, qui court-circuite au
 * premier caractère différent et fuit donc la longueur et le préfixe par
 * le temps de réponse. La vérification du COOKIE, elle, était déjà
 * timing-safe (`verifyScanCookie` ci-dessous) : les deux moitiés de la
 * même porte n'étaient pas au même niveau.
 *
 * On hache les deux côtés avant de comparer : `timingSafeEqual` exige des
 * buffers de MÊME LONGUEUR, et deux SHA-256 en font toujours 32 octets —
 * ce qui évite au passage de fuir la longueur du PIN attendu.
 */
export function verifyScanPin(pin: unknown): boolean {
  const attendu = process.env.SCAN_PIN;
  if (!attendu) return false;
  if (typeof pin !== "string" || pin.length === 0) return false;
  const fourni = crypto.createHash("sha256").update(pin, "utf8").digest();
  const cible = crypto.createHash("sha256").update(attendu, "utf8").digest();
  return crypto.timingSafeEqual(fourni, cible);
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
 * Fabrique le cookie de session scan (7 jours — voir `SEPT_JOURS_MS`).
 * Suppose la config valide : l'appelant a déjà vérifié isScanConfigured().
 */
export function createScanCookie(): ScanCookie {
  const secret = process.env.SCAN_COOKIE_SECRET as string;
  const expiresMs = Date.now() + SEPT_JOURS_MS;
  const value = `${expiresMs}.${sign(expiresMs, secret)}`;
  return {
    name: SCAN_COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SEPT_JOURS_SEC,
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
