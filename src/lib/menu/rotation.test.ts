import { describe, expect, it } from "vitest";
import {
  LONGUEUR_CYCLE,
  PAIRES,
  indexDuCycle,
  jourDeService,
  paireDuJour,
  railsDuJour,
  slugsFantomes,
} from "./rotation";
import { COLLECTIONS } from "./collections";

/**
 * Ce que ces tests protègent : la paire de carrousels affichée est DÉRIVÉE
 * de la date, sans cron ni table. Si le calcul se trompe, personne ne le
 * voit — c'est précisément le mode de panne qu'on cherche à éviter.
 */

describe("le cycle et les paires", () => {
  it("compte 6 paires, donc 12 rails, sans doublon ni oubli", () => {
    expect(LONGUEUR_CYCLE).toBe(6);
    const cites = PAIRES.flat();
    expect(cites).toHaveLength(12);
    expect(new Set(cites).size).toBe(12);
  });

  it("ne cite que des rails qui existent vraiment", () => {
    const bilan = slugsFantomes(COLLECTIONS.map((c) => c.slug));
    expect(bilan.fantomes, "slugs cités mais inexistants").toEqual([]);
    expect(bilan.jamaisAffiches, "rails qui ne passeraient jamais").toEqual([]);
    expect(bilan.doublons, "rails affichés deux fois par cycle").toEqual([]);
  });

  it("détecte une faute de frappe dans un slug", () => {
    const bilan = slugsFantomes(["incontournables"]);
    expect(bilan.fantomes.length).toBeGreaterThan(0);
  });
});

describe("la frontière de jour à 05:00 Europe/Zurich", () => {
  it.each([
    // Été (UTC+2). 04h59 locale = 02:59 UTC → encore la veille.
    ["2026-08-21T02:59:00Z", "2026-08-20", "04h59 locale, veille"],
    ["2026-08-21T03:00:00Z", "2026-08-21", "05h00 locale, bascule"],
    ["2026-08-21T03:01:00Z", "2026-08-21", "05h01 locale"],
    // Minuit et demi : le client commande en plein service.
    ["2026-08-21T22:30:00Z", "2026-08-21", "00h30 locale le 22 = service du 21"],
    // Hiver (UTC+1). 04h59 locale = 03:59 UTC.
    ["2026-01-15T03:59:00Z", "2026-01-14", "hiver, 04h59 locale"],
    ["2026-01-15T04:00:00Z", "2026-01-15", "hiver, 05h00 locale"],
  ])("%s → jour de service %s (%s)", (instant, attendu) => {
    expect(jourDeService(new Date(instant))).toBe(attendu);
  });

  it("ne saute ni ne double un jour au passage à l'heure d'été", () => {
    // Nuit du 28 au 29 mars 2026 : 02:00 → 03:00 locale.
    // 05:00 reste une frontière franche, jamais traversée deux fois.
    const veille = jourDeService(new Date("2026-03-29T02:00:00Z")); // 04h locale
    const apres = jourDeService(new Date("2026-03-29T03:00:00Z")); // 05h locale
    expect(veille).toBe("2026-03-28");
    expect(apres).toBe("2026-03-29");
  });

  it("ne saute ni ne double un jour au passage à l'heure d'hiver", () => {
    // Nuit du 24 au 25 octobre 2026 : 03:00 → 02:00 locale.
    const veille = jourDeService(new Date("2026-10-25T03:00:00Z")); // 04h locale
    const apres = jourDeService(new Date("2026-10-25T04:00:00Z")); // 05h locale
    expect(veille).toBe("2026-10-24");
    expect(apres).toBe("2026-10-25");
  });
});

describe("la rotation elle-même", () => {
  it("change de paire chaque jour", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const jour = new Date(Date.UTC(2026, 7, 21 + i)).toISOString().slice(0, 10);
      vus.add(paireDuJour(jour).join("|"));
    }
    expect(vus.size, "6 jours consécutifs doivent donner 6 paires").toBe(6);
  });

  it("revient à la même paire exactement 6 jours plus tard", () => {
    const a = paireDuJour("2026-08-21");
    const b = paireDuJour("2026-08-27");
    expect(b).toEqual(a);
  });

  it("DÉCALE d'une semaine sur l'autre — l'habitué du samedi ne voit pas toujours la même chose", () => {
    // 6 samedis d'affilée : le cycle de 6 contre une semaine de 7 décale
    // d'un cran chaque semaine, donc les 6 paires défilent.
    const samedis = ["2026-08-22", "2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26"];
    const vus = new Set(samedis.map((j) => paireDuJour(j).join("|")));
    expect(vus.size).toBe(6);
  });

  it("est stable : deux appels le même jour donnent la même paire", () => {
    expect(paireDuJour("2026-08-21")).toEqual(paireDuJour("2026-08-21"));
  });

  it("ne renvoie jamais d'index hors du cycle, même sur des dates extrêmes", () => {
    for (const j of ["1969-01-01", "1970-01-01", "2026-08-21", "2099-12-31"]) {
      const i = indexDuCycle(j);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(LONGUEUR_CYCLE);
    }
  });
});

describe("la sélection des rails à afficher", () => {
  const tous = COLLECTIONS.map((c) => ({ slug: c.slug, titre: c.titre }));

  it("n'en garde que DEUX", () => {
    expect(railsDuJour(tous, "2026-08-21")).toHaveLength(2);
  });

  it("respecte l'ordre de la paire, pas celui du fichier", () => {
    const jour = "2026-08-21";
    const [premier, second] = paireDuJour(jour);
    const rendus = railsDuJour(tous, jour).map((r) => r.slug);
    expect(rendus).toEqual([premier, second]);
  });

  it("laisse tomber en silence un rail vidé par les filtres, sans casser l'autre", () => {
    const jour = "2026-08-21";
    const [premier] = paireDuJour(jour);
    // Le second rail a disparu (tous ses plats filtrés ou épuisés).
    const partiel = tous.filter((r) => r.slug === premier);
    const rendus = railsDuJour(partiel, jour);
    expect(rendus).toHaveLength(1);
    expect(rendus[0].slug).toBe(premier);
  });

  it("ne rend rien plutôt que n'importe quoi si les deux rails ont disparu", () => {
    expect(railsDuJour([], "2026-08-21")).toEqual([]);
  });

  it("sur 6 jours, les 12 rails passent tous exactement une fois", () => {
    const vus: string[] = [];
    for (let i = 0; i < 6; i++) {
      const jour = new Date(Date.UTC(2026, 7, 21 + i)).toISOString().slice(0, 10);
      vus.push(...railsDuJour(tous, jour).map((r) => r.slug));
    }
    expect(vus).toHaveLength(12);
    expect(new Set(vus).size).toBe(12);
  });
});
