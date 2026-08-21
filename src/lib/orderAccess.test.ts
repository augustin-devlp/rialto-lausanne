import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildConfirmationUrl,
  isOrderAccessConfigured,
  signOrderToken,
  verifyOrderToken,
} from "./orderAccess";

/**
 * Ce que ces tests protègent : la page /confirmation et trois routes
 * voisines étaient publiques, avec des numéros de commande SÉQUENTIELS.
 * Le jeton est le seul verrou. Une régression ici rouvre une fuite de
 * données personnelles.
 */

const RESTO = "046d930d-a4cd-4a43-a11a-7f76bfe74b06";
const NUM = "R-2026-052";

const envInitial = { ...process.env };

beforeEach(() => {
  process.env.ORDER_LINK_SECRET = "secret-de-test-courant";
  delete process.env.ORDER_LINK_SECRET_PREVIOUS;
});

afterEach(() => {
  process.env = { ...envInitial };
});

describe("signature et vérification", () => {
  it("accepte le jeton qu'il vient de produire", () => {
    const jeton = signOrderToken(RESTO, NUM)!;
    expect(verifyOrderToken(RESTO, NUM, jeton)).toBe(true);
  });

  it("produit 22 caractères, soit 128 bits", () => {
    expect(signOrderToken(RESTO, NUM)).toHaveLength(22);
  });

  it("reste dans l'alphabet base64url (donc dans GSM-7, donc sans surcoût SMS)", () => {
    for (const n of ["R-2026-001", "R-2026-052", "R-2026-999", "R-2027-100"]) {
      expect(signOrderToken(RESTO, n)!).toMatch(/^[A-Za-z0-9_-]{22}$/);
    }
  });

  it("donne un jeton DIFFÉRENT pour chaque commande", () => {
    const jetons = new Set(
      Array.from({ length: 200 }, (_, i) =>
        signOrderToken(RESTO, `R-2026-${String(i).padStart(3, "0")}`),
      ),
    );
    expect(jetons.size).toBe(200);
  });

  it("REFUSE le jeton d'une autre commande — le cœur de la garde", () => {
    const jetonAutre = signOrderToken(RESTO, "R-2026-051")!;
    expect(verifyOrderToken(RESTO, "R-2026-052", jetonAutre)).toBe(false);
  });

  it("refuse un jeton d'un autre restaurant", () => {
    const autreResto = "00000000-0000-0000-0000-000000000000";
    const jeton = signOrderToken(autreResto, NUM)!;
    expect(verifyOrderToken(RESTO, NUM, jeton)).toBe(false);
  });

  it.each([
    ["vide", ""],
    ["absent", null],
    ["indéfini", undefined],
    ["trop court", "abc"],
    ["trop long", "a".repeat(40)],
    ["bruit de bonne longueur", "AAAAAAAAAAAAAAAAAAAAAA"],
    ["pas du base64url", "!!!!!!!!!!!!!!!!!!!!!!"],
  ])("refuse un jeton %s", (_cas, valeur) => {
    expect(verifyOrderToken(RESTO, NUM, valeur as string | null)).toBe(false);
  });

  it("refuse un jeton dont un seul caractère a changé", () => {
    const jeton = signOrderToken(RESTO, NUM)!;
    const altere = (jeton[0] === "A" ? "B" : "A") + jeton.slice(1);
    expect(verifyOrderToken(RESTO, NUM, altere)).toBe(false);
  });
});

describe("absence de secret — le sens sûr ne s'inverse jamais", () => {
  it("sans secret, isOrderAccessConfigured dit non", () => {
    delete process.env.ORDER_LINK_SECRET;
    expect(isOrderAccessConfigured()).toBe(false);
  });

  it("sans secret, on ne SIGNE pas (on ne fabrique pas un lien mort silencieux)", () => {
    delete process.env.ORDER_LINK_SECRET;
    expect(signOrderToken(RESTO, NUM)).toBeNull();
  });

  it("⚠️ sans secret, TOUT accès est REFUSÉ — jamais l'inverse", () => {
    const jeton = signOrderToken(RESTO, NUM)!;
    delete process.env.ORDER_LINK_SECRET;
    delete process.env.ORDER_LINK_SECRET_PREVIOUS;
    expect(verifyOrderToken(RESTO, NUM, jeton)).toBe(false);
  });
});

describe("rotation du secret", () => {
  it("un lien déjà envoyé survit à la rotation grâce au secret précédent", () => {
    const ancien = signOrderToken(RESTO, NUM)!;
    // Rotation : l'ancien secret passe en PREVIOUS, un nouveau prend sa place.
    process.env.ORDER_LINK_SECRET_PREVIOUS = "secret-de-test-courant";
    process.env.ORDER_LINK_SECRET = "secret-de-test-nouveau";

    expect(verifyOrderToken(RESTO, NUM, ancien)).toBe(true);
    // Et le nouveau fonctionne aussi.
    expect(verifyOrderToken(RESTO, NUM, signOrderToken(RESTO, NUM)!)).toBe(true);
  });

  it("après la seconde rotation, le jeton d'origine meurt bien", () => {
    const origine = signOrderToken(RESTO, NUM)!;
    process.env.ORDER_LINK_SECRET_PREVIOUS = "secret-de-test-nouveau";
    process.env.ORDER_LINK_SECRET = "secret-de-test-troisieme";
    expect(verifyOrderToken(RESTO, NUM, origine)).toBe(false);
  });
});

describe("fabrique d'URL — l'unique du dépôt", () => {
  it("construit une URL de suivi portant le jeton", () => {
    const url = buildConfirmationUrl({
      siteUrl: "https://rialto.example",
      restaurantId: RESTO,
      orderNumber: NUM,
    });
    expect(url).toMatch(
      /^https:\/\/rialto\.example\/confirmation\/R-2026-052\?t=[A-Za-z0-9_-]{22}$/,
    );
    // Et l'URL produite doit être acceptée par la garde.
    const jeton = new URL(url).searchParams.get("t");
    expect(verifyOrderToken(RESTO, NUM, jeton)).toBe(true);
  });

  it("ne double jamais le slash quand le site a une barre finale", () => {
    const url = buildConfirmationUrl({
      siteUrl: "https://rialto.example/",
      restaurantId: RESTO,
      orderNumber: NUM,
    });
    expect(url).not.toContain("//confirmation");
  });

  it("encode un numéro de commande exotique", () => {
    const url = buildConfirmationUrl({
      siteUrl: "https://rialto.example",
      restaurantId: RESTO,
      orderNumber: "R 2026/052",
    });
    expect(url).toContain("/confirmation/R%202026%2F052");
  });
});
