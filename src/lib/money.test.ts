import { describe, it, expect } from "vitest";
import {
  centimes,
  atteint,
  enDessous,
  auDessus,
  memeMontant,
  estNul,
  manqueJusqua,
} from "./money";

/**
 * Règle gravée par Augustin le 22.08.2026 : aucune comparaison d'argent ne
 * se fait en flottant. Ces tests verrouillent les cas RÉELS trouvés dans le
 * dépôt, pas des cas inventés.
 */

/** Trois plats aux prix pratiqués chez Rialto. Vaut 45 francs. Pèse moins. */
const PANIER_45 = 19.9 + 12.2 + 12.9;
/** Trois autres. Vaut 25 francs. Pèse moins. */
const PANIER_25 = 19.9 + 2.4 + 2.7;

describe("le cas qui a coûté la règle", () => {
  it("les paniers de référence sont bien en dessous en flottant", () => {
    expect(PANIER_45).toBeLessThan(45);
    expect(PANIER_45).not.toBe(45);
    expect(PANIER_25).toBeLessThan(25);
    expect(PANIER_25).not.toBe(25);
  });

  it("🔴 mais ils VALENT le montant, et le seuil est atteint", () => {
    expect(atteint(PANIER_45, 45)).toBe(true);
    expect(atteint(PANIER_25, 25)).toBe(true);
    expect(manqueJusqua(PANIER_45, 45)).toBe(0);
    expect(manqueJusqua(PANIER_25, 25)).toBe(0);
  });

  it("🔴 et le refus ne se déclenche pas — le jumeau du bug des codes promo", () => {
    // `promoCodes.ts` refusait un code à 45 de minimum sur ce panier.
    expect(enDessous(PANIER_45, 45)).toBe(false);
  });
});

describe("centimes", () => {
  it("convertit et absorbe le résidu", () => {
    expect(centimes(45)).toBe(4500);
    expect(centimes(PANIER_45)).toBe(4500);
    expect(centimes(0.1 + 0.2)).toBe(30); // 0.30000000000000004
    expect(centimes(19.9)).toBe(1990);
  });

  it("accepte ce que PostgREST rend pour un numeric — une chaîne", () => {
    expect(centimes("35.00")).toBe(3500);
    expect(centimes("8")).toBe(800);
  });

  it("🔴 ne rend JAMAIS NaN : un NaN ouvre ou ferme une porte au hasard", () => {
    expect(centimes(Number.NaN)).toBe(0);
    expect(centimes(null)).toBe(0);
    expect(centimes(undefined)).toBe(0);
    expect(centimes("abc")).toBe(0);
    expect(centimes(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("gère les négatifs (remises, coût net négatif de l'upsell)", () => {
    expect(centimes(-6.5)).toBe(-650);
    expect(estNul(-0)).toBe(true);
  });
});

describe("les prédicats de seuil", () => {
  it("un vrai manque reste un manque", () => {
    expect(atteint(44.98, 45)).toBe(false);
    expect(enDessous(44.98, 45)).toBe(true);
    expect(manqueJusqua(44.98, 45)).toBe(0.02);
  });

  it("le centime est la plus petite unité — pas de demi-centime qui traîne", () => {
    // 44.995 s'arrondit à 45.00 : c'est ce qu'affiche le client.
    expect(atteint(44.995, 45)).toBe(true);
    // 44.994 s'arrondit à 44.99 : il manque bien 1 centime.
    expect(atteint(44.994, 45)).toBe(false);
    expect(manqueJusqua(44.994, 45)).toBe(0.01);
  });

  it("🔴 manqueJusqua n'affiche jamais 0.00 en bloquant", () => {
    // La propriété qui remplace l'ancien plancher à 0.01 : si ce n'est pas
    // atteint, il manque AU MOINS un centime. Balayage sur 400 valeurs.
    for (let c = 0; c <= 4499; c++) {
      const montant = c / 100;
      expect(manqueJusqua(montant, 45)).toBeGreaterThanOrEqual(0.01);
      expect(atteint(montant, 45)).toBe(false);
    }
    expect(manqueJusqua(45, 45)).toBe(0);
    expect(atteint(45, 45)).toBe(true);
  });

  it("auDessus est strict", () => {
    expect(auDessus(80, 80)).toBe(false);
    expect(auDessus(80.01, 80)).toBe(true);
    expect(auDessus(79.99, 80)).toBe(false);
  });

  it("memeMontant remplace l'égalité stricte", () => {
    expect(memeMontant(PANIER_45, 45)).toBe(true);
    expect(memeMontant(0.1 + 0.2, 0.3)).toBe(true);
    expect(memeMontant(45, 45.01)).toBe(false);
  });

  it("estNul remplace `montant === 0`", () => {
    expect(estNul(0)).toBe(true);
    expect(estNul(0.001)).toBe(true); // moins d'un demi-centime
    expect(estNul(0.01)).toBe(false);
    expect(estNul(5)).toBe(false);
  });
});

describe("les quatre anneaux réels de la grille", () => {
  it("relevés en base le 22.08 : 25 / 35 / 45 / 55", () => {
    for (const min of [25, 35, 45, 55]) {
      expect(atteint(min, min)).toBe(true);
      expect(manqueJusqua(min, min)).toBe(0);
      expect(manqueJusqua(min - 0.01, min)).toBe(0.01);
      expect(enDessous(min - 0.01, min)).toBe(true);
    }
  });
});
