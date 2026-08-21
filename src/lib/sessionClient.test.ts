import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  creeCookieSession,
  verifieCookieSession,
  cookieDeconnexion,
  isSessionClientConfigured,
  SESSION_COOKIE_NAME,
} from "./sessionClient";

const SECRET = "secret-de-test-session-client";
const CLIENT = "45e4a002-81eb-4232-b277-a79e9cf46cce";
const AUTRE_CLIENT = "6e3c0051-9a9d-4230-806f-2b3ce0ae00fd";

describe("session client signée", () => {
  let avant: NodeJS.ProcessEnv;
  beforeEach(() => {
    avant = { ...process.env };
    process.env.CLIENT_SESSION_SECRET = SECRET;
    vi.useRealTimers();
  });
  afterEach(() => {
    process.env = avant;
    vi.useRealTimers();
  });

  it("un cookie fabriqué se relit et rend le bon client", () => {
    const c = creeCookieSession(CLIENT);
    expect(verifieCookieSession(c.value)).toBe(CLIENT);
  });

  it("🔴 CHANGER LE CLIENT DANS LE COOKIE LE CASSE", () => {
    // La garde qui empêche de lire les commandes de quelqu'un d'autre en
    // éditant son propre cookie. C'est LE test de ce module.
    const c = creeCookieSession(CLIENT);
    const [, exp, sig] = c.value.split(".");
    expect(verifieCookieSession(`${AUTRE_CLIENT}.${exp}.${sig}`)).toBeNull();
  });

  it("🔴 REPOUSSER L'ÉCHÉANCE LE CASSE AUSSI", () => {
    const c = creeCookieSession(CLIENT);
    const [id, exp, sig] = c.value.split(".");
    const plusTard = Number(exp) + 365 * 24 * 60 * 60 * 1000;
    expect(verifieCookieSession(`${id}.${plusTard}.${sig}`)).toBeNull();
  });

  it("une signature bricolée est refusée", () => {
    const c = creeCookieSession(CLIENT);
    const [id, exp, sig] = c.value.split(".");
    expect(verifieCookieSession(`${id}.${exp}.${sig.slice(0, -2)}00`)).toBeNull();
    expect(verifieCookieSession(`${id}.${exp}.`)).toBeNull();
    expect(verifieCookieSession(`${id}.${exp}`)).toBeNull();
    expect(verifieCookieSession("nimportequoi")).toBeNull();
    expect(verifieCookieSession("")).toBeNull();
    expect(verifieCookieSession(null)).toBeNull();
    expect(verifieCookieSession(undefined)).toBeNull();
  });

  it("un cookie signé avec un autre secret est refusé", () => {
    const c = creeCookieSession(CLIENT);
    process.env.CLIENT_SESSION_SECRET = "autre-secret";
    expect(verifieCookieSession(c.value)).toBeNull();
  });

  it("une échéance non numérique ne passe pas", () => {
    const c = creeCookieSession(CLIENT);
    const [id, , sig] = c.value.split(".");
    expect(verifieCookieSession(`${id}.abc.${sig}`)).toBeNull();
    expect(verifieCookieSession(`${id}.-1.${sig}`)).toBeNull();
  });

  it("le cookie expire après 30 jours", () => {
    const c = creeCookieSession(CLIENT);
    expect(c.options.maxAge).toBe(30 * 24 * 60 * 60);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60 * 1000 + 1000);
    expect(verifieCookieSession(c.value)).toBeNull();
  });

  it("le cookie est httpOnly et sameSite lax", () => {
    const c = creeCookieSession(CLIENT);
    // httpOnly : hors de portée d'un XSS, seule protection réelle puisque
    // ce cookie n'est pas révocable côté serveur.
    expect(c.options.httpOnly).toBe(true);
    expect(c.options.sameSite).toBe("lax");
    expect(c.name).toBe(SESSION_COOKIE_NAME);
  });

  it("la déconnexion efface le cookie", () => {
    const d = cookieDeconnexion();
    expect(d.name).toBe(SESSION_COOKIE_NAME);
    expect(d.value).toBe("");
    expect(d.options.maxAge).toBe(0);
    expect(verifieCookieSession(d.value)).toBeNull();
  });

  it("sans secret, aucune session n'est valide — jamais de porte ouverte", () => {
    const c = creeCookieSession(CLIENT);
    delete process.env.CLIENT_SESSION_SECRET;
    expect(isSessionClientConfigured()).toBe(false);
    expect(verifieCookieSession(c.value)).toBeNull();
  });
});
