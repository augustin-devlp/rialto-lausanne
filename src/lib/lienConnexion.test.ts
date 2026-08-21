import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  signeLienConnexion,
  verifieLienConnexion,
  normaliseEmail,
  construitUrlConnexion,
  DUREE_LIEN_MS,
  PARAM_LIEN,
} from "./lienConnexion";

/**
 * Le lien de connexion est la SEULE preuve de possession du mécanisme de
 * session. Ces tests couvrent ses gardes, pas son confort.
 */

const SECRET = "secret-de-test-lien-connexion";
const AUTRE = "un-tout-autre-secret";
const EMAIL = "mehmet@exemple.ch";

describe("lien de connexion", () => {
  let avant: NodeJS.ProcessEnv;
  beforeEach(() => {
    avant = { ...process.env };
    process.env.LOGIN_LINK_SECRET = SECRET;
    delete process.env.LOGIN_LINK_SECRET_PREVIOUS;
    vi.useRealTimers();
  });
  afterEach(() => {
    process.env = avant;
    vi.useRealTimers();
  });

  it("un jeton fraîchement signé se vérifie", () => {
    const j = signeLienConnexion(EMAIL)!;
    expect(verifieLienConnexion(EMAIL, j)).toEqual({ ok: true, email: EMAIL });
  });

  it("🔴 UN JETON SIGNÉ POUR UNE ADRESSE NE VAUT PAS POUR UNE AUTRE", () => {
    // La garde qui empêche d'ouvrir le compte du voisin avec son propre lien.
    const j = signeLienConnexion(EMAIL)!;
    const v = verifieLienConnexion("quelquun.dautre@exemple.ch", j);
    expect(v.ok).toBe(false);
    expect(v).toMatchObject({ motif: "invalide" });
  });

  it("la normalisation rend la vérification insensible à la casse et aux espaces", () => {
    const j = signeLienConnexion("  Mehmet@Exemple.CH ")!;
    expect(verifieLienConnexion(EMAIL, j).ok).toBe(true);
    expect(verifieLienConnexion("MEHMET@EXEMPLE.CH", j).ok).toBe(true);
  });

  it("⚠️ mais elle NE touche PAS aux points ni au +", () => {
    // Ces règles sont propres à Gmail ; les appliquer à tous ferait tomber
    // des adresses légitimes.
    expect(normaliseEmail("a.b+c@exemple.ch")).toBe("a.b+c@exemple.ch");
    const j = signeLienConnexion("a.b@exemple.ch")!;
    expect(verifieLienConnexion("ab@exemple.ch", j).ok).toBe(false);
  });

  it("un jeton bricolé est refusé", () => {
    const j = signeLienConnexion(EMAIL)!;
    const [ech, sig] = j.split(".");
    expect(verifieLienConnexion(EMAIL, `${ech}.${sig}x`).ok).toBe(false);
    expect(verifieLienConnexion(EMAIL, `${ech}.`).ok).toBe(false);
    expect(verifieLienConnexion(EMAIL, `${Number(ech) + 1}.${sig}`).ok).toBe(false);
    expect(verifieLienConnexion(EMAIL, "nimportequoi").ok).toBe(false);
    expect(verifieLienConnexion(EMAIL, "").ok).toBe(false);
    expect(verifieLienConnexion(EMAIL, null).ok).toBe(false);
  });

  it("🔴 REPOUSSER L'ÉCHÉANCE NE PROLONGE PAS LE LIEN", () => {
    // L'échéance est DANS la charge signée : la modifier casse la signature.
    const j = signeLienConnexion(EMAIL)!;
    const sig = j.slice(j.indexOf(".") + 1);
    const plusTard = Date.now() + 10 * 24 * 60 * 60 * 1000;
    expect(verifieLienConnexion(EMAIL, `${plusTard}.${sig}`).ok).toBe(false);
  });

  it("un jeton signé avec un autre secret est refusé", () => {
    const j = signeLienConnexion(EMAIL)!;
    process.env.LOGIN_LINK_SECRET = AUTRE;
    expect(verifieLienConnexion(EMAIL, j).ok).toBe(false);
  });

  it("la ROTATION ne coupe personne : l'ancien secret reste accepté", () => {
    const ancien = signeLienConnexion(EMAIL)!;
    process.env.LOGIN_LINK_SECRET = AUTRE;
    process.env.LOGIN_LINK_SECRET_PREVIOUS = SECRET;
    expect(verifieLienConnexion(EMAIL, ancien).ok).toBe(true);
    // Et le nouveau marche aussi.
    expect(verifieLienConnexion(EMAIL, signeLienConnexion(EMAIL)!).ok).toBe(true);
  });

  it("🔴 PÉRIMÉ et INVALIDE sont distingués — le client doit savoir quoi faire", () => {
    const j = signeLienConnexion(EMAIL)!;
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + DUREE_LIEN_MS + 1000);
    const v = verifieLienConnexion(EMAIL, j);
    expect(v.ok).toBe(false);
    expect(v).toMatchObject({ motif: "perime" });
    // Un jeton faux, lui, reste « invalide » et non « périmé ».
    expect(verifieLienConnexion(EMAIL, "0.faux")).toMatchObject({
      motif: "invalide",
    });
  });

  it("le lien vaut exactement 15 minutes", () => {
    const j = signeLienConnexion(EMAIL)!;
    const echeance = Number(j.slice(0, j.indexOf(".")));
    const restant = echeance - Date.now();
    expect(restant).toBeGreaterThan(DUREE_LIEN_MS - 5000);
    expect(restant).toBeLessThanOrEqual(DUREE_LIEN_MS);
  });

  it("sans secret, rien ne se signe et rien ne se vérifie", () => {
    delete process.env.LOGIN_LINK_SECRET;
    expect(signeLienConnexion(EMAIL)).toBeNull();
    expect(verifieLienConnexion(EMAIL, "0.x")).toMatchObject({
      motif: "non_configure",
    });
  });

  it("l'URL porte l'adresse encodée et le jeton", () => {
    const j = signeLienConnexion("a+b@exemple.ch")!;
    const url = construitUrlConnexion("a+b@exemple.ch", j);
    expect(url).toContain("/rialto-club/connexion/lien");
    expect(url).toContain(`${PARAM_LIEN}=`);
    // Le + doit être encodé, sinon il se relit comme une espace.
    expect(url).toContain("a%2Bb%40exemple.ch");
    // Et l'URL doit se relire correctement.
    const u = new URL(url);
    expect(u.searchParams.get("e")).toBe("a+b@exemple.ch");
    expect(verifieLienConnexion(u.searchParams.get("e")!, u.searchParams.get(PARAM_LIEN)).ok).toBe(true);
  });
});
