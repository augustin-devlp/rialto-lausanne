import { describe, it, expect } from "vitest";
import {
  ecartAuMinimum,
  minimumDeZone,
  MINIMUM_DE_REPLI_CHF,
  TOLERANCE_CHF,
} from "./minimum";

/**
 * Dérivation unique du minimum de commande par zone (Augustin, 22.08.2026).
 * Ces tests verrouillent les DEUX bugs que la double formule cachait.
 */

describe("minimumDeZone — un seul repli, jamais 0", () => {
  it("rend le minimum de la zone quand il existe", () => {
    expect(minimumDeZone({ min_order_amount: 45 })).toBe(45);
    expect(minimumDeZone({ min_order_amount: 55 })).toBe(55);
  });

  it("accepte une valeur numérique en chaîne (ce que rend PostgREST sur un numeric)", () => {
    expect(minimumDeZone({ min_order_amount: "35.00" })).toBe(35);
  });

  it("🔴 NE REND JAMAIS 0 — c'était le bug des trois écrivains du snapshot", () => {
    // `Number(null) === 0` : « aucun minimum », porte ouverte côté client.
    expect(minimumDeZone({ min_order_amount: null })).toBe(MINIMUM_DE_REPLI_CHF);
    expect(minimumDeZone({ min_order_amount: undefined })).toBe(MINIMUM_DE_REPLI_CHF);
    expect(minimumDeZone({})).toBe(MINIMUM_DE_REPLI_CHF);
    expect(minimumDeZone(null)).toBe(MINIMUM_DE_REPLI_CHF);
    expect(minimumDeZone(undefined)).toBe(MINIMUM_DE_REPLI_CHF);
    expect(minimumDeZone({ min_order_amount: 0 })).toBe(MINIMUM_DE_REPLI_CHF);
  });

  it("ignore une valeur ininterprétable plutôt que de rendre NaN", () => {
    expect(minimumDeZone({ min_order_amount: "abc" })).toBe(MINIMUM_DE_REPLI_CHF);
    expect(minimumDeZone({ min_order_amount: -10 })).toBe(MINIMUM_DE_REPLI_CHF);
  });
});

describe("ecartAuMinimum — le panier PILE au minimum", () => {
  it("un panier exactement au minimum est atteint", () => {
    const e = ecartAuMinimum(45, { min_order_amount: 45 });
    expect(e.atteint).toBe(true);
    expect(e.remaining).toBe(0);
  });

  it("🔴 un résidu flottant ne bloque plus la commande — cas réel de 3 plats", () => {
    // CE N'EST PAS UN CAS THÉORIQUE. Trois plats aux prix pratiqués chez
    // Rialto, dans une zone à 45 de minimum :
    //   19.90 + 12.20 + 12.90 = 44.99999999999999
    // Le panier est PILE au minimum, l'écran affiche « Encore 0.00 CHF »…
    // et `missing === 0` valait false, donc le bouton « Passer la commande »
    // restait désactivé. Le client ne pouvait rien faire, et rien à l'écran
    // ne lui disait quoi ajouter.
    const panier = 19.9 + 12.2 + 12.9;
    expect(panier).not.toBe(45); // le résidu est bien là
    expect(panier).toBeLessThan(45);
    const e = ecartAuMinimum(panier, { min_order_amount: 45 });
    expect(e.atteint).toBe(true);
    expect(e.remaining).toBe(0);
  });

  it("la tolérance ne dépasse pas le demi-centime — un vrai manque reste un manque", () => {
    // 44.98 est en dessous de 45 de 2 centimes : ça, ça doit bloquer.
    const e = ecartAuMinimum(45 - 0.02, { min_order_amount: 45 });
    expect(e.atteint).toBe(false);
    expect(e.remaining).toBe(0.02);
    // Et la frontière exacte de la tolérance.
    expect(ecartAuMinimum(45 - TOLERANCE_CHF, { min_order_amount: 45 }).atteint).toBe(true);
    expect(ecartAuMinimum(45 - 0.011, { min_order_amount: 45 }).atteint).toBe(false);
  });
});

describe("ecartAuMinimum — l'arrondi, celui qui divergeait", () => {
  it("arrondit au centime SUPÉRIEUR sans sur-corriger sur les prix en .80/.90", () => {
    // Le piège documenté sur le palier de gratuité : un ceil direct sur la
    // différence flottante affichait 10.21 au lieu de 10.20.
    const e = ecartAuMinimum(39.8, { min_order_amount: 50 });
    expect(e.remaining).toBe(10.2);
  });

  it("n'affiche jamais « 0.00 » quand il manque vraiment quelque chose", () => {
    const e = ecartAuMinimum(44.999, { min_order_amount: 46 });
    expect(e.remaining).toBeGreaterThanOrEqual(0.01);
  });

  it("plancher à 0.01 sur un manque infime mais réel", () => {
    const e = ecartAuMinimum(45 - 0.006, { min_order_amount: 45 });
    expect(e.atteint).toBe(false);
    expect(e.remaining).toBe(0.01);
  });

  it("les quatre anneaux réels de la grille", () => {
    for (const [min, panier, attendu] of [
      [25, 20, 5],
      [35, 20, 15],
      [45, 20, 25],
      [55, 20, 35],
    ] as const) {
      const e = ecartAuMinimum(panier, { min_order_amount: min });
      expect(e.minimum).toBe(min);
      expect(e.remaining).toBe(attendu);
      expect(e.atteint).toBe(false);
    }
  });
});

describe("ecartAuMinimum — entrées dégradées", () => {
  it("un sous-total non fini est traité comme 0, jamais comme NaN", () => {
    const e = ecartAuMinimum(Number.NaN, { min_order_amount: 45 });
    expect(e.atteint).toBe(false);
    expect(e.remaining).toBe(45);
  });

  it("un panier au-dessus du minimum n'a rien à ajouter", () => {
    const e = ecartAuMinimum(120, { min_order_amount: 45 });
    expect(e.atteint).toBe(true);
    expect(e.remaining).toBe(0);
  });

  it("sans zone, le repli s'applique et le minimum n'est jamais nul", () => {
    const e = ecartAuMinimum(10, null);
    expect(e.minimum).toBe(MINIMUM_DE_REPLI_CHF);
    // Le dénominateur de la barre de progression ne peut donc pas être 0.
    expect(e.minimum).toBeGreaterThan(0);
  });
});
