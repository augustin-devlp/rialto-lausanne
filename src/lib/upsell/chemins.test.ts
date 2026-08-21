import { describe, expect, it } from "vitest";
import { analyzeCart } from "./cartAnalysis";
import {
  ECART_MAX_PALIER,
  choisitChemin,
  idsInconnus,
  interditAvecLePanier,
  SEUIL_TABLEE,
} from "./chemins";
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
  BAKLAVA: "9a40203f-8005-4914-8f1e-47076ebdab50",
  TIRAMISU: "6d2dd901-99d2-4a76-bb03-a6c77c2d99af",
  GLACE_NOIX: "a254fea6-e24e-46b3-871f-2c0121f49ba7",
  GLACE_COOKIE: "3598fbf8-f1f9-4431-bf79-24dca6f56e0f",
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
  art({ id: ID.BAKLAVA, dish_role: "dessert", price: 10, category_id: CAT.DESSERTS, cuisine_style: "anatolian" }),
  // Le Tiramisu est marqué alcoolisé EN BASE : le filtre d'entrée l'écarte.
  art({ id: ID.TIRAMISU, dish_role: "dessert", price: 9, category_id: CAT.DESSERTS, contains_alcohol: true }),
  art({ id: ID.GLACE_NOIX, dish_role: "dessert", price: 17, category_id: CAT.DESSERTS, serves_pax: 3 }),
  art({ id: ID.GLACE_COOKIE, dish_role: "dessert", price: 17, category_id: CAT.DESSERTS, serves_pax: 3 }),
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

  it("ne propose AUCUN ACCOMPAGNEMENT sur un hamburger — il vient déjà avec ses frites", () => {
    // Il n'est pas muet pour autant : il tombe sur P5 (dessert). C'est la
    // règle corrigée par Augustin le 21.08 — pour un burger, une boisson ou
    // un dessert, jamais un accompagnement.
    const r = chemin([burger(), boisson()]);
    expect(r?.chemin).not.toBe("P4");
    const ids = r?.candidats.map((c) => c.id) ?? [];
    expect(ids).not.toContain(ID.FRITES);
    expect(ids).not.toContain(ID.SALADE);
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


describe("🔴 l'interdiction DURE pizza / frites", () => {
  it("interdit les frites dès qu'une pizza est au panier", () => {
    const a = analyzeCart([pizza()]);
    expect(interditAvecLePanier({ id: ID.FRITES }, a)).toBe(true);
  });

  it("laisse passer les frites sans pizza", () => {
    const a = analyzeCart([viande()]);
    expect(interditAvecLePanier({ id: ID.FRITES }, a)).toBe(false);
  });

  it("n'interdit QUE les frites — la salade reste permise avec une pizza", () => {
    const a = analyzeCart([pizza()]);
    expect(interditAvecLePanier({ id: ID.SALADE }, a)).toBe(false);
    expect(interditAvecLePanier({ id: ID.POTATOES }, a)).toBe(false);
  });

  it("tient même quand la pizza est noyée dans un gros panier", () => {
    const a = analyzeCart([viande(), pates(), pizza(), boisson()]);
    expect(interditAvecLePanier({ id: ID.FRITES }, a)).toBe(true);
  });
});

describe("le filtre d'entrée du module (règle : la garde vit dans la fonction)", () => {
  it("ne propose JAMAIS un article épuisé, même si le chemin le désigne", () => {
    const casse = CATALOGUE.map((i) =>
      i.id === ID.COCA_05 || i.id === ID.COCA_ZERO_05
        ? { ...i, is_out_of_stock: true }
        : i,
    );
    const panier = [pizza()];
    const r = choisitChemin(panier, analyzeCart(panier), casse);
    // P3 n'a plus de candidat → il passe la main à P4.
    expect(r?.candidats.every((c) => !c.is_out_of_stock)).toBe(true);
    expect(r?.chemin).not.toBe("P3");
  });

  it("ne propose JAMAIS un article alcoolisé", () => {
    const casse = CATALOGUE.map((i) =>
      i.id === ID.SALADE ? { ...i, contains_alcohol: true } : i,
    );
    const panier = [pizza(), boisson()];
    const r = choisitChemin(panier, analyzeCart(panier), casse);
    expect(r?.candidats.some((c) => c.id === ID.SALADE)).toBe(false);
  });
});

describe("P4 sur un panier COMBO", () => {
  const combo = () =>
    art({ id: "combo-1", dish_role: "combo", price: 28, category_id: CAT.PIZZA });

  it("n'est plus muet : un combo pizza reçoit bien une suggestion", () => {
    // Un combo porte déjà sa boisson → P3 ne se déclenche pas.
    const panier = [combo(), boisson()];
    const r = choisitChemin(panier, analyzeCart(panier), CATALOGUE);
    expect(r?.chemin).toBe("P4");
    expect(r?.candidats.length).toBeGreaterThan(0);
  });

  it("et l'interdiction pizza/frites s'applique aussi au combo pizza", () => {
    const panier = [combo(), boisson()];
    const ids = choisitChemin(panier, analyzeCart(panier), CATALOGUE)
      ?.candidats.map((c) => c.id) ?? [];
    expect(ids).not.toContain(ID.FRITES);
  });
});


describe("P5 — le dessert", () => {
  it("propose un dessert quand plat + boisson sont là, sans dessert", () => {
    // Panier pizza + coca + salade : P3 et P4 sont fermés, P5 prend la main.
    const r = chemin([pizza(), boisson(), salade()]);
    expect(r?.chemin).toBe("P5");
  });

  it("🔴 retombe sur le BAKLAVA pour un panier italien — le Tiramisu est marqué alcoolisé", () => {
    const r = chemin([pizza(), boisson(), salade()]);
    const ids = r?.candidats.map((c) => c.id) ?? [];
    expect(ids, "le Tiramisu doit être écarté par le filtre d'entrée").not.toContain(
      ID.TIRAMISU,
    );
    expect(ids[0]).toBe(ID.BAKLAVA);
  });

  it("propose le Baklava sur un panier anatolien", () => {
    const r = chemin([anatolien(), boisson(), salade()]);
    expect(r?.candidats[0].id).toBe(ID.BAKLAVA);
  });

  it("passe au format partage en mode TABLÉE", () => {
    const r = chemin([pizza(), pates(), viande(), boisson(), salade()]);
    expect(r?.chemin).toBe("P5");
    expect(r?.candidats.map((c) => c.id)).toEqual([ID.GLACE_NOIX, ID.GLACE_COOKIE]);
  });

  it("ne dit rien s'il y a déjà un dessert", () => {
    const r = chemin([pizza(), boisson(), salade(), dessert()]);
    expect(r?.chemin).not.toBe("P5");
  });
});

describe("🔴 le BURGER : une boisson ou un dessert, JAMAIS un accompagnement", () => {
  it("burger seul → une boisson (P3), pas un accompagnement", () => {
    const r = chemin([burger()]);
    expect(r?.chemin).toBe("P3");
  });

  it("burger + boisson → un DESSERT (P5), jamais des frites ni une salade", () => {
    const r = chemin([burger(), boisson()]);
    expect(r?.chemin).toBe("P5");
    const ids = r?.candidats.map((c) => c.id) ?? [];
    expect(ids).not.toContain(ID.FRITES);
    expect(ids).not.toContain(ID.SALADE);
    expect(ids).not.toContain(ID.POTATOES);
  });
});


describe("P2 — la distance au palier", () => {
  const palier = (remaining: number, fee: number) => ({
    remaining,
    delivery_fee: fee,
  });
  const p2 = (panier: MenuItemFull[], remaining: number, fee: number) =>
    choisitChemin(panier, analyzeCart(panier), CATALOGUE, palier(remaining, fee));

  it("se déclenche quand il reste peu pour franchir le seuil", () => {
    const r = p2([pizza()], 7, 5);
    expect(r?.chemin).toBe("P2");
  });

  it("🔴 CONDITION ① — ne propose QUE des articles dont le prix couvre l'écart", () => {
    // Écart de 12 : les frites (8), potatoes (9) et rösti (10) ne suffisent
    // PAS. Les proposer promettrait un seuil qui ne serait pas franchi.
    const r = p2([pizza()], 12, 5);
    const prix = r?.candidats.map((c) => c.price) ?? [];
    expect(prix.length).toBeGreaterThan(0);
    expect(Math.min(...prix)).toBeGreaterThanOrEqual(12);
  });

  it("propose le MOINS CHER qui satisfait — on ne pousse jamais au maximum", () => {
    const r = p2([pizza()], 7, 5);
    const prix = r?.candidats.map((c) => c.price) ?? [];
    expect(prix).toEqual([...prix].sort((a, b) => a - b));
    expect(prix[0]).toBe(8); // les frites, le moins cher au-dessus de 7
  });

  it("se tait si l'écart est trop grand — on ne demande pas trop d'un coup", () => {
    const r = p2([pizza()], ECART_MAX_PALIER + 1, 5);
    expect(r?.chemin).not.toBe("P2");
  });

  it("se tait si le seuil est déjà franchi", () => {
    const r = p2([pizza()], 0, 5);
    expect(r?.chemin).not.toBe("P2");
  });

  it("se tait sans palier — pas d'adresse, zone gratuite, ou toggle coupé", () => {
    const panier = [pizza()];
    const r = choisitChemin(panier, analyzeCart(panier), CATALOGUE, null);
    expect(r?.chemin).not.toBe("P2");
  });

  it("PASSE DEVANT P3 : franchir un palier vaut mieux que combler un trou", () => {
    // Pizza seule : P3 (boisson) matcherait aussi. P2 doit gagner.
    const r = p2([pizza()], 7, 5);
    expect(r?.chemin).toBe("P2");
  });

  it("porte le palier pour que l'affichage puisse décomposer", () => {
    const r = p2([pizza()], 7, 12);
    expect(r?.palier).toEqual({ remaining: 7, delivery_fee: 12 });
  });

  it("ne propose jamais un plat principal — on comble, on ne redouble pas le repas", () => {
    const r = p2([pizza()], 7, 5);
    expect(r?.candidats.every((c) => c.dish_role !== "main")).toBe(true);
  });

  it("ne propose jamais un article DÉJÀ au panier", () => {
    const panier = [pizza(), salade()];
    const r = choisitChemin(panier, analyzeCart(panier), CATALOGUE, palier(7, 5));
    expect(r?.candidats.some((c) => c.id === ID.SALADE)).toBe(false);
  });
});


describe("🔴 le palier ne doit JAMAIS survivre au repli sur le scoreur", () => {
  it("P2 sans aucun candidat viable ne laisse pas d'économie derrière lui", () => {
    // Écart de 12 : seuls les articles à 13+ conviennent. On les rend tous
    // épuisés → P2 n'a plus de candidat. Le chemin ne doit PAS « gagner ».
    const casse = CATALOGUE.map((i) =>
      i.price >= 12 ? { ...i, is_out_of_stock: true } : i,
    );
    const panier = [pizza()];
    const r = choisitChemin(panier, analyzeCart(panier), casse, {
      remaining: 12,
      delivery_fee: 5,
    });
    // Soit un autre chemin prend la main, soit rien — mais jamais P2.
    expect(r?.chemin).not.toBe("P2");
  });

  it("un candidat P2 couvre TOUJOURS l'écart, sinon la promesse est fausse", () => {
    for (const ecart of [1, 5, 7, 9, 11, 12]) {
      const panier = [pizza()];
      const r = choisitChemin(panier, analyzeCart(panier), CATALOGUE, {
        remaining: ecart,
        delivery_fee: 5,
      });
      if (r?.chemin !== "P2") continue;
      for (const c of r.candidats) {
        expect(
          c.price,
          `écart ${ecart} : « ${c.name} » à ${c.price} ne franchit pas le seuil`,
        ).toBeGreaterThanOrEqual(ecart);
      }
    }
  });
});
