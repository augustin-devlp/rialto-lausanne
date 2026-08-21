import { describe, it, expect } from "vitest";
import {
  nettoieLibelle,
  extraitNpa,
  coupeLibelle,
  litSuggestions,
  urlRecherche,
} from "./geoadmin";

/**
 * Les cas viennent d'appels RÉELS à l'API GeoAdmin, faits le 22.08.2026 sur
 * l'adresse du Rialto. Pas d'exemples inventés : les pièges de cette API
 * sont précisément ceux qu'on n'imagine pas.
 */

/** Réponse réelle, tronquée aux champs qu'on lit. */
const REPONSE_REELLE = {
  results: [
    {
      attrs: {
        label: "Avenue de Béthusy 11 <b>1005 Lausanne</b>",
        detail: "avenue de bethusy 11 1005 lausanne 5586 lausanne ch vd",
        origin: "address",
        num: 11,
        lat: 46.52191162109375,
        lon: 6.644395351409912,
        x: 1152599.5,
        y: 2539055.0,
      },
    },
    {
      attrs: {
        label: "Avenue de Béthusy 11.1 <b>1005 Lausanne</b>",
        detail: "avenue de bethusy 11.1 1005 lausanne 5586 lausanne ch vd",
        origin: "address",
        // 🔴 PIÈGE ⑤ : le label dit « 11.1 », `num` dit 111.
        num: 111,
      },
    },
  ],
};

describe("piège ① — le NPA n'a pas de champ propre", () => {
  it("prend le PREMIER bloc de 4 chiffres, pas le numéro de commune", () => {
    // « 5586 » est le numéro OFS de Lausanne. Prendre le dernier bloc
    // donnerait un NPA qui n'existe pas.
    expect(
      extraitNpa("avenue de bethusy 11 1005 lausanne 5586 lausanne ch vd"),
    ).toBe("1005");
  });

  it("ne se laisse pas couper au milieu d'un nombre plus long", () => {
    expect(extraitNpa("rue x 11005 quelquepart")).toBeNull();
    expect(extraitNpa("rue x 100 quelquepart")).toBeNull();
  });

  it("un NPA ne commence jamais par zéro en Suisse", () => {
    expect(extraitNpa("rue x 0999 quelquepart")).toBeNull();
    expect(extraitNpa("rue x 1000 quelquepart")).toBe("1000");
    expect(extraitNpa("rue x 9999 quelquepart")).toBe("9999");
  });

  it("rend null quand il n'y en a pas", () => {
    expect(extraitNpa("")).toBeNull();
    expect(extraitNpa("lausanne ch vd")).toBeNull();
  });
});

describe("piège ② — le label porte des balises de surlignage", () => {
  it("retire les <b>", () => {
    expect(nettoieLibelle("Avenue de Béthusy 11 <b>1005 Lausanne</b>")).toBe(
      "Avenue de Béthusy 11 1005 Lausanne",
    );
  });

  it("retire TOUTE balise, pas seulement <b>", () => {
    // Une règle écrite pour <b> seul laisserait passer <em> ou <mark> le
    // jour où l'API change de balise.
    expect(nettoieLibelle("Rue <em>x</em> <mark>1005</mark>")).toBe("Rue x 1005");
    expect(nettoieLibelle("<script>alert(1)</script>Rue x")).toBe("alert(1)Rue x");
  });

  it("normalise les espaces", () => {
    expect(nettoieLibelle("  Rue   x    1005  ")).toBe("Rue x 1005");
  });
});

describe("découpage rue / npa / ville", () => {
  it("coupe au NPA", () => {
    expect(coupeLibelle("Avenue de Béthusy 11 1005 Lausanne", "1005")).toEqual({
      rue: "Avenue de Béthusy 11",
      ville: "Lausanne",
    });
  });

  it("garde le numéro tel qu'il est écrit, y compris avec un point", () => {
    // 🔴 PIÈGE ⑤ : c'est le label qui fait foi, pas `num`.
    expect(coupeLibelle("Avenue de Béthusy 11.1 1005 Lausanne", "1005")).toEqual({
      rue: "Avenue de Béthusy 11.1",
      ville: "Lausanne",
    });
  });

  it("ne casse pas si le NPA est absent du libellé", () => {
    expect(coupeLibelle("Quelque part", "1005")).toEqual({
      rue: "Quelque part",
      ville: "",
    });
  });
});

describe("lecture d'une réponse réelle", () => {
  it("rend deux suggestions propres", () => {
    const s = litSuggestions(REPONSE_REELLE);
    expect(s).toHaveLength(2);
    expect(s[0]).toEqual({
      rue: "Avenue de Béthusy 11",
      npa: "1005",
      ville: "Lausanne",
      libelle: "Avenue de Béthusy 11 1005 Lausanne",
    });
    expect(s[1].rue).toBe("Avenue de Béthusy 11.1");
  });

  it("🔴 n'expose NI x/y NI num — piège ③ et ⑤", () => {
    // x/y sont en coordonnées suisses ET inversés ; num a perdu le point.
    // Un champ inutilisé finit par être mal utilisé : on ne les sort pas.
    const s = litSuggestions(REPONSE_REELLE);
    for (const x of s) {
      expect(Object.keys(x).sort()).toEqual(["libelle", "npa", "rue", "ville"]);
    }
  });

  it("écarte ce qui n'est pas une adresse", () => {
    const s = litSuggestions({
      results: [
        { attrs: { label: "Lausanne", detail: "lausanne 5586 vd", origin: "gg25" } },
        { attrs: { label: "Parcelle 42 <b>1005</b>", detail: "42 1005 x", origin: "parcel" } },
      ],
    });
    expect(s).toEqual([]);
  });

  it("écarte ce dont on ne peut pas tirer un NPA", () => {
    const s = litSuggestions({
      results: [{ attrs: { label: "Rue sans code", detail: "rue sans code", origin: "address" } }],
    });
    expect(s).toEqual([]);
  });

  it("dédoublonne les libellés identiques", () => {
    const un = REPONSE_REELLE.results[0];
    expect(litSuggestions({ results: [un, un, un] })).toHaveLength(1);
  });

  it("ne jette jamais sur une réponse inattendue", () => {
    for (const brut of [null, undefined, {}, { results: null }, { results: "x" }, 42]) {
      expect(() => litSuggestions(brut)).not.toThrow();
      expect(litSuggestions(brut)).toEqual([]);
    }
    expect(litSuggestions({ results: [null, {}, { attrs: {} }] })).toEqual([]);
  });
});

describe("l'URL d'appel", () => {
  it("demande des adresses et encode la recherche", () => {
    const u = new URL(urlRecherche("Béthusy 11 & co"));
    expect(u.origin + u.pathname).toBe(
      "https://api3.geo.admin.ch/rest/services/api/SearchServer",
    );
    expect(u.searchParams.get("type")).toBe("locations");
    expect(u.searchParams.get("origins")).toBe("address");
    expect(u.searchParams.get("searchText")).toBe("Béthusy 11 & co");
  });
});
