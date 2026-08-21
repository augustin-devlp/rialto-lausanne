import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import {
  verifyScanPin,
  createScanCookie,
  verifyScanCookie,
  isScanConfigured,
} from "./scanAuth";

/**
 * Durcissement du PIN de scan (Augustin, 22.08.2026) : 8 caractères
 * alphanumériques, comparaison en temps constant, session à 7 jours.
 *
 * Ces tests couvrent ce qui est VÉRIFIABLE ici. Ce qui ne l'est pas est dit
 * dans le dernier bloc, plutôt que faussement rassuré par un test.
 */

const PIN_REEL = "K7m2Qx9p"; // 8 alphanumériques, comme la décision
const SECRET = "secret-de-test-uniquement";

describe("verifyScanPin", () => {
  let avant: NodeJS.ProcessEnv;

  beforeEach(() => {
    avant = { ...process.env };
    process.env.SCAN_PIN = PIN_REEL;
    process.env.SCAN_COOKIE_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = avant;
  });

  it("accepte le PIN exact", () => {
    expect(verifyScanPin(PIN_REEL)).toBe(true);
  });

  it("refuse un PIN faux de même longueur", () => {
    expect(verifyScanPin("K7m2Qx9q")).toBe(false);
  });

  it("refuse un PIN qui n'est qu'un PRÉFIXE du bon", () => {
    // Le cas que la comparaison `!==` fuyait par le temps de réponse.
    expect(verifyScanPin("K7m2")).toBe(false);
    expect(verifyScanPin("K")).toBe(false);
  });

  it("refuse un PIN plus long qui COMMENCE par le bon", () => {
    expect(verifyScanPin(PIN_REEL + "zz")).toBe(false);
  });

  it("est sensible à la casse", () => {
    expect(verifyScanPin(PIN_REEL.toLowerCase())).toBe(false);
    expect(verifyScanPin(PIN_REEL.toUpperCase())).toBe(false);
  });

  it("refuse le vide, le null, l'undefined", () => {
    expect(verifyScanPin("")).toBe(false);
    expect(verifyScanPin(null)).toBe(false);
    expect(verifyScanPin(undefined)).toBe(false);
  });

  it("NE JETTE PAS sur un type inattendu — un POST bricolé rend 401, pas 500", () => {
    // `body.pin` est un cast brut de req.json() : rien ne garantit une chaîne.
    expect(() => verifyScanPin(42)).not.toThrow();
    expect(verifyScanPin(42)).toBe(false);
    expect(verifyScanPin({})).toBe(false);
    expect(verifyScanPin([])).toBe(false);
    expect(verifyScanPin(true)).toBe(false);
  });

  it("refuse TOUT si SCAN_PIN est absent — jamais de porte ouverte par défaut", () => {
    delete process.env.SCAN_PIN;
    expect(verifyScanPin("")).toBe(false);
    expect(verifyScanPin("nimporte")).toBe(false);
    // Et le cas vicieux : la valeur absente ne doit pas matcher undefined.
    expect(verifyScanPin(undefined as unknown as string)).toBe(false);
    expect(isScanConfigured()).toBe(false);
  });

  it("accepte un PIN alphanumérique de 8 caractères — la décision du 22.08", () => {
    // Garde-fou de non-régression : si quelqu'un remet un filtre numérique
    // quelque part, ce test tombe.
    process.env.SCAN_PIN = "aB3dE7gH";
    expect(verifyScanPin("aB3dE7gH")).toBe(true);
  });
});

describe("session de scan — 7 jours depuis le 22.08.2026", () => {
  let avant: NodeJS.ProcessEnv;
  beforeEach(() => {
    avant = { ...process.env };
    process.env.SCAN_PIN = PIN_REEL;
    process.env.SCAN_COOKIE_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = avant;
  });

  const SEPT_JOURS_SEC = 7 * 24 * 60 * 60;

  it("le cookie dure 7 jours, pas 30", () => {
    const c = createScanCookie();
    expect(c.options.maxAge).toBe(SEPT_JOURS_SEC);
    // Le garde-fou qui compte vraiment : que ça ne soit PLUS 30 jours.
    expect(c.options.maxAge).not.toBe(30 * 24 * 60 * 60);
  });

  it("le cookie reste httpOnly et sameSite lax", () => {
    const c = createScanCookie();
    expect(c.options.httpOnly).toBe(true);
    expect(c.options.sameSite).toBe("lax");
  });

  it("l'échéance encodée dans la valeur colle aux 7 jours", () => {
    const c = createScanCookie();
    const expiresMs = Number(c.value.slice(0, c.value.indexOf(".")));
    const restant = expiresMs - Date.now();
    expect(restant).toBeGreaterThan(SEPT_JOURS_SEC * 1000 - 60_000);
    expect(restant).toBeLessThanOrEqual(SEPT_JOURS_SEC * 1000);
  });

  it("un cookie fabriqué maison est refusé", () => {
    const faux = `${Date.now() + 1000}.${"0".repeat(64)}`;
    expect(verifyScanCookie(faux)).toBe(false);
  });

  it("un cookie signé avec un AUTRE secret est refusé", () => {
    const expiresMs = Date.now() + 1000;
    const hmac = crypto
      .createHmac("sha256", "un-autre-secret")
      .update(String(expiresMs))
      .digest("hex");
    expect(verifyScanCookie(`${expiresMs}.${hmac}`)).toBe(false);
  });

  it("un cookie EXPIRÉ mais correctement signé est refusé", () => {
    const expiresMs = Date.now() - 1;
    const hmac = crypto
      .createHmac("sha256", SECRET)
      .update(String(expiresMs))
      .digest("hex");
    expect(verifyScanCookie(`${expiresMs}.${hmac}`)).toBe(false);
  });
});

/**
 * ⚠️ CE QUE CES TESTS NE PROUVENT PAS — écrit ici plutôt que laissé croire.
 *
 * 1. LE TEMPS CONSTANT n'est pas mesuré. On ne teste pas une durée dans une
 *    CI : c'est instable et ça donnerait une fausse assurance. Ce qui est
 *    testé, c'est le COMPORTEMENT (préfixe refusé, casse, types) ; le temps
 *    constant vient de `crypto.timingSafeEqual` sur deux SHA-256, qui font
 *    toujours 32 octets.
 * 2. LA LONGUEUR RÉELLE DE `SCAN_PIN` EN PRODUCTION n'est pas vérifiable
 *    d'ici : la variable n'est pas dans `.env.local`. Aucun test ne peut
 *    garantir qu'elle fait 8 caractères — c'est Augustin qui la pose.
 * 3. LE RATE-LIMIT n'est pas testé : son `Map` vit dans une instance de
 *    lambda, donc son comportement en production ne se reproduit pas ici.
 */
