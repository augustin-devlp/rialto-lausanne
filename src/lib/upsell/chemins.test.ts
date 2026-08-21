import { describe, expect, it } from "vitest";
import { analyzeCart } from "./cartAnalysis";
import { choisitChemin, idsInconnus, SEUIL_TABLEE } from "./chemins";
import type { MenuItemFull } from "./types";

/**
 * Ces tests passent par le VRAI analyseur de panier (`analyzeCart`), pas par
 * une analyse simulée : c'est le branchement réel qui doit être juste, pas
 * seulement la logique en vase clos.
 */

const CAT = {
  PIZZA: "244cfb35-dc56-47e5-b251-862cb623e482",
  PATES: "d30e7b56-3df5-4a6a-95e3-abeeb85b3ebb",
  VIANDES: "ceabb32d-190c-4c28-ad1f-f0ebbc79a283",
  POISSONS: "d8117593-23be-4b25-8de6-5dfe80996f38",
  HAMBURGERS: "68f2821b-b2ae-47a4-8166-92d9a2d61dac",
  LASAGNE: "d59b5816-2f22-43d9-bc54-643c228ea87b",
  TORTELLINIS: "6576bf45-6c06-476e-a2f4-f8a491f80430",
  ENTREES: "afde7f8d-c1e9-4f86-93e4-c1de716c8f9b",
  SOFT: "12d13ee7-7f95-47ac-b3b6-cfa169cd1148",
  DESSERTS: "261008dc-cf44-4809-9b34-868ea8cfdf29",
};

const ID = {
  COCA_05: "63889d31-a920-4a73-b5a4-12bfcb6e1575",
  COCA_15: "1fad6b68-90c8-48ae-9aac-b648db8829f2",
  FRITES: "70b16d92-7e04-40a9-9984-429313029fc3",
  POTATOES: "f198ecfe-b29b-4be3-9910-b3bb991471bc",
  ROSTI: "201c2cd7-d201-4c55-b1bc-f6d3e2942083",
  SALADE: "3e311046-cda7-4851-90ba-1ac5690e0361",
  TOMATE_MOZZA: "c714276f-c8b0-450c-bf13-d0394e8cbbdc",
  VIGNE_5: "7982d1e7-4186-4aa9-80d3-b33863434d0a",
  FALAFELS_4: "eb211daa-b84c-4656-b89f-cae7ed196a30",
  VIGNE_11: "37464a33-eada-4f3b-8060-768181c29f48",
  FALAFELS_11: "7da2f3e2-eb1a-4a11-8553-a3cb2e09d083",
  CALAMARS_11: "df18a882-c0f9-44cc-85de-cd15fc76f2af",
  COCA_ZERO_05: "fe329962-741f-4e93-aadb-677a07db2cbd",
  COCA_ZERO_15: "a0184db6-659a-4eba-a9ba-227e3dfcbae0",
};

function art(p: Partial<MenuItemFull> & { id: string }): MenuItemFull {
  return {
    name: p.id,
    price: 25,
    margin_weight: 1,
    is_available: true,
    is_out_of_stock: false,
    category_id: CAT.PIZZA,
    heat_level: 0,
    richness_level: 3,
    saltiness_level: 3,
    sweetness_level: 0,
    acidity_level: 0,
    caloric_density: 3,
    fat_level: 3,
    dish_role: "main",
    cuisine_style: "italian",
    main_ingredient: "cheese",
    is_vegetarian: false,
    contains_pork: false,
    contains_alcohol: false,
    serves_pax: 1,
    is_shareable: false,
    ideal_time_of_day: [],
    upsell_tags: [],
    pairs_well_with_ids: [],
    avoid_with_ids: [],
    semantic_tags: [],
    ...p,
  } as MenuItemFull;
}

/** Catalogue minimal contenant tous les articles que les chemins citent. */
const CATALOGUE: MenuItemFull[] = [
  art({ id: ID.COCA_05, dish_role: "drink_soft", price: 3.5, category_id: CAT.SOFT }),
  art({ id: ID.COCA_ZERO_05, dish_role: "drink_soft", price: 3.5, category_id: CAT.SOFT }),
  art({ id: ID.COCA_15, dish_role: "drink_soft", price: 8.5, category_id: CAT.SOFT }),
  art({ id: ID.COCA_ZERO_15, dish_role: "drink_soft", price: 8.5, category_id: CAT.SOFT }),
  art({ id: ID.FRITES, dish_role: "side", price: 8, category_id: CAT.ENTREES }),
  art({ id: ID.POTATOES, dish_role: "side", price: 9, category_id: CAT.ENTREES }),
  art({ id: ID.ROSTI, dish_role: "side", price: 10, category_id: CAT.ENTREES }),
  art({ id: ID.SALADE, dish_role: "starter", price: 13, category_id: CAT.ENTREES }),
  art({ id: ID.TOMATE_MOZZA, dish_role: "starter", price: 13, category_id: CAT.ENTREES }),
  art({ id: ID.VIGNE_5, dish_role: "starter", price: 13, category_id: CAT.ENTREES }),
  art({ id: ID.FALAFELS_4, dish_role: "starter", price: 13, category_id: CAT.ENTREES }),
  art({ id: ID.VIGNE_11, dish_role: "starter", price: 21, category_id: CAT.ENTREES }),
  art({ id: ID.FALAFELS_11, dish_role: "starter", price: 21, category_id: CAT.ENTREES }),
  art({ id: ID.CALAMARS_11, dish_role: "starter", price: 21, category_id: CAT.ENTREES }),
];

const pizza = (q = 1) => art({ id: "pizza-1", category_id: CAT.PIZZA, quantity: q });
const pates = () => art({ id: "pates-1", category_id: CAT.PATES, cuisine_style: "italian" });
const viande = () => art({ id: "viande-1", category_id: CAT.VIANDES, main_ingredient: "beef" });
const poisson = () => art({ id: "poisson-1", category_id: CAT.POISSONS, main_ingredient: "fish" });
const burger = () =>
  art({ id: "burger-1", category_id: CAT.HAMBURGERS, upsell_tags: ["fries_included"] });
const anatolien = () =>
  art({ id: "tajine-1", category_id: CAT.VIANDES, cuisine_style: "anatolian" });
// `universal` comme en base : c'est ce qui dilue dominantCuisine, et c'est
// exactement le piège que le classement par PLATS évite.
const boisson = () =>
  art({ id: ID.COCA_05, dish_role: "drink_soft", price: 3.5, category_id: CAT.SOFT, cuisine_style: "universal" });
const dessert = () => art({ id: "dessert-1", dish_role: "dessert", price: 9, category_id: CAT.DESSERTS });
const salade = () => art({ id: ID.SALADE, dish_role: "starter", price: 13, category_id: CAT.ENTREES });

function chemin(panier: MenuItemFull[]) {
  return choisitChemin(panier, analyzeCart(panier), CATALOGUE);
}

describe("garde d'intégrité", () => {
  it("ne cite aucun article ni catégorie absent du catalogue de test", () => {
    const complet = [
      ...CATALOGUE,
      pizza(), pates(), viande(), poisson(), burger(),
      art({ id: "lasagne-1", category_id: CAT.LASAGNE }),
      art({ id: "tortellini-1", category_id: CAT.TORTELLINIS }),
    ];
    const bilan = idsInconnus(complet);
    expect(bilan.articles).toEqual([]);
    expect(bilan.categories).toEqual([]);
  });
});

describe("P3 — plat sans boisson", () => {
  it("propose un Coca 0.5l sur une pizza seule", () => {
    const r = chemin([pizza()]);
    expect(r?.chemin).toBe("P3");
    expect(r?.candidats[0].id).toBe(ID.COCA_05);
  });

  it("propose les deux versions, normal d'abord (Zéro non tranché par la spec)", () => {
    const r = chemin([pizza()]);
    expect(r?.candidats.map((c) => c.id)).toEqual([ID.COCA_05, ID.COCA_ZERO_05]);
  });

  it("ne dit rien s'il y a déjà une boisson", () => {
    const r = chemin([pizza(), boisson()]);
    expect(r?.chemin).not.toBe("P3");
  });

  it("ne dit rien sur un panier sans plat principal", () => {
    expect(chemin([salade()])).toBeNull();
  });

  it("passe au 1.5l dès 3 plats — le mode TABLÉE", () => {
    const r = chemin([pizza(), pates(), viande()]);
    expect(r?.chemin).toBe("P3");
    expect(r?.candidats[0].id).toBe(ID.COCA_15);
  });

  it("compte les QUANTITÉS, pas les lignes : une pizza ×3 est une tablée", () => {
    const r = chemin([pizza(3)]);
    expect(r?.candidats[0].id).toBe(ID.COCA_15);
    expect(SEUIL_TABLEE).toBe(3);
  });
});

describe("P4 — plat sans accompagnement", () => {
  it("🔴 JAMAIS de frites avec une pizza", () => {
    const r = chemin([pizza(), boisson()]);
    expect(r?.chemin).toBe("P4");
    const ids = r?.candidats.map((c) => c.id) ?? [];
    expect(ids).not.toContain(ID.FRITES);
    expect(ids).not.toContain(ID.POTATOES);
    expect(ids[0]).toBe(ID.SALADE);
  });

  it("propose un féculent sur une viande grillée", () => {
    const r = chemin([viande(), boisson()]);
    expect(r?.chemin).toBe("P4");
    expect(r?.candidats.map((c) => c.id)).toEqual([ID.POTATOES, ID.ROSTI]);
  });

  it("propose la salade sur des pâtes", () => {
    const r = chemin([pates(), boisson()]);
    expect(r?.candidats[0].id).toBe(ID.SALADE);
  });

  it("propose rösti ou salade sur un poisson", () => {
    const r = chemin([poisson(), boisson()]);
    expect(r?.candidats.map((c) => c.id)).toEqual([ID.ROSTI, ID.SALADE]);
  });

  it("propose des mezze sur un panier anatolien, même si c'est une viande", () => {
    const r = chemin([anatolien(), boisson()]);
    expect(r?.chemin).toBe("P4");
    expect(r?.candidats.map((c) => c.id)).toEqual([ID.VIGNE_5, ID.FALAFELS_4]);
  });

  it("ne propose RIEN sur un hamburger — il vient déjà avec ses frites", () => {
    const r = chemin([burger(), boisson()]);
    expect(r).toBeNull();
  });

  it("ne dit rien s'il y a déjà un accompagnement", () => {
    const r = chemin([pizza(), boisson(), salade()]);
    expect(r?.chemin).not.toBe("P4");
  });

  it("passe aux formats 11 pièces en mode TABLÉE", () => {
    const r = chemin([pizza(), pates(), viande(), boisson()]);
    expect(r?.chemin).toBe("P4");
    expect(r?.candidats.map((c) => c.id)).toEqual([ID.VIGNE_11, ID.FALAFELS_11]);
  });
});

describe("la priorité entre chemins", () => {
  it("la BOISSON passe avant l'accompagnement — le premier qui matche gagne", () => {
    // Pizza seule : P3 et P4 matchent tous les deux. P3 doit gagner.
    const r = chemin([pizza()]);
    expect(r?.chemin).toBe("P3");
  });

  it("ne cumule JAMAIS deux chemins", () => {
    const r = chemin([pizza()]);
    expect(r?.chemin).toBe("P3");
    expect(r?.candidats.every((c) => c.dish_role === "drink_soft")).toBe(true);
  });
});

describe("P8 — le silence", () => {
  it("ne dit RIEN quand le repas est complet", () => {
    const r = chemin([pizza(), boisson(), salade(), dessert()]);
    expect(r?.chemin).toBe("P8");
    expect(r?.candidats).toEqual([]);
  });

  it("ferme la porte AVANT que P3 ou P4 ne trouvent un trou", () => {
    // Repas complet : ni P3 ni P4 ne doivent l'emporter.
    const r = chemin([pizza(), boisson(), salade(), dessert()]);
    expect(r?.chemin).not.toBe("P3");
    expect(r?.chemin).not.toBe("P4");
  });

  it("un repas SANS dessert n'est pas complet — on parle encore", () => {
    const r = chemin([pizza(), boisson(), salade()]);
    expect(r?.chemin).not.toBe("P8");
  });
});

describe("panier vide ou hors sujet", () => {
  it("ne dit rien sur un panier vide", () => {
    expect(chemin([])).toBeNull();
  });

  it("ne dit rien sur une boisson seule", () => {
    expect(chemin([boisson()])).toBeNull();
  });
});
