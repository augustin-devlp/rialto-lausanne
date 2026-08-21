import { describe, expect, it, vi, afterEach } from "vitest";
import { renderTemplate, TEMPLATE_META } from "./smsTemplates";

/**
 * Ce que ces tests protègent : un SMS bascule en UCS-2 — 70 caractères par
 * segment au lieu de 160, donc 2 à 3 fois le prix — dès qu'UN caractère sort
 * de l'alphabet GSM-7. Les prénoms des clients de Rialto sont la principale
 * source de ces caractères.
 *
 * On teste par `renderTemplate` et non par la translittération elle-même :
 * c'est le chemin réel, celui qu'emprunte un vrai SMS.
 */

/** Alphabet GSM-7 (03.38), base + table d'extension. */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà" +
  "^{}\\[~]|€";

const horsGsm7 = (s: string) => [...s].filter((c) => !GSM7.includes(c));

const rendu = (nom: string) =>
  renderTemplate("Bonjour {{customer_name}} !", { customer_name: nom });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("translittération GSM-7 des valeurs injectées", () => {
  // Le cœur du lot : les lettres SANS décomposition Unicode, que
  // normalize("NFD") ne peut pas atteindre.
  it.each([
    ["Işık", "Isik", "turc — le caractère turc le plus fréquent"],
    ["Çağrı", "Cagri", "turc — ı en finale"],
    ["Đorđe", "Dorde", "serbo-croate — d barré"],
    ["Đukić", "Dukic", "serbo-croate — majuscule et minuscule"],
    ["Łukasz", "Lukasz", "polonais — l barré"],
  ])("%s → %s (%s)", (entree, attendu) => {
    expect(rendu(entree)).toBe(`Bonjour ${attendu} !`);
  });

  // Les alphabets qui passaient DÉJÀ : on vérifie qu'on ne les a pas cassés.
  it.each([
    ["Ëngjëll", "Engjell", "albanais — était déjà propre"],
    ["Gonçalves", "Goncalves", "portugais"],
    ["Conceição", "Conceicao", "portugais — tilde"],
    ["Benoît", "Benoit", "français"],
    ["Müller", "Muller", "allemand"],
    ["Ferhunde", "Ferhunde", "aucun accent — inchangé"],
  ])("%s → %s (%s)", (entree, attendu) => {
    expect(rendu(entree)).toBe(`Bonjour ${attendu} !`);
  });

  it("ne laisse AUCUN caractère hors GSM-7 sur les prénoms de la clientèle", () => {
    const prenoms = [
      "Işık", "Çağrı", "Đorđe", "Đukić", "Łukasz", "Ëngjëll",
      "Krenar", "Blerim", "Gonçalves", "Conceição", "Müller", "Élodie",
    ];
    for (const p of prenoms) {
      expect(horsGsm7(rendu(p)), `${p} fait basculer le SMS en UCS-2`).toEqual([]);
    }
  });

  it("signale — sans mutiler — un caractère qu'il ne sait pas translittérer", () => {
    // Un prénom en alphabet non latin ne peut pas être translittéré
    // honnêtement. On préfère un prénom juste à un prénom mutilé : le
    // caractère RESTE, mais un avertissement part dans les logs serveur pour
    // que le surcoût ne soit jamais découvert sur la facture.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sortie = rendu("Даниил");
    expect(sortie).toContain("Даниил");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("UCS-2");
  });

  it("ne dit rien quand tout est propre", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rendu("Işık");
    expect(warn).not.toHaveBeenCalled();
  });

  it("laisse les URLs intactes", () => {
    const url = "https://rialto-lausanne.vercel.app/confirmation/R-2026-052";
    expect(renderTemplate("Suivi : {{card_url}}", { card_url: url })).toBe(
      `Suivi : ${url}`,
    );
  });

  it("remplace une variable absente par du vide, jamais par son nom", () => {
    const sortie = renderTemplate("Bonjour {{customer_name}} !", {});
    expect(sortie).not.toContain("customer_name");
    expect(sortie).not.toContain("{{");
  });
});


describe("le CORPS du template, pas seulement les valeurs", () => {
  it("signale un emoji en dur dans le texte — il double le coût quel que soit le prénom", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderTemplate(TEMPLATE_META.referral_success.defaultContent, {
      customer_name: "Marc",
      reward_label: "une pizza",
      code: "ABC",
    });
    expect(warn).toHaveBeenCalled();
    const messages = warn.mock.calls.map((c) => String(c[0])).join(" ");
    expect(messages).toContain("TEXTE du template");
  });

  it("ne dit rien sur un template entièrement GSM-7", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderTemplate(TEMPLATE_META.loyalty_card_created.defaultContent, {
      customer_name: "Marc",
      card_url: "https://exemple.ch/c/ABCD1234",
    });
    expect(warn).not.toHaveBeenCalled();
  });
});
