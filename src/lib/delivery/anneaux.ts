/**
 * Groupement de la grille delivery_zones en ANNEAUX pour la vue de
 * consultation du dashboard (lot vue zones, 19.08.2026).
 *
 * L'anneau N'EXISTE PAS en base : il est DÉRIVÉ du panier minimum
 * (min_order_amount), LA variable discriminante de la grille ZL1
 * (A 25 / B 35 / C 45 / D 55). Les lettres et plages de distance sont un
 * HABILLAGE éditorial : si la grille évolue vers un minimum inconnu, le
 * groupe apparaît quand même (lettre suivante, sans plage) — la vue ne
 * cache jamais une zone réelle. Les VALEURS (minimum, frais, seuil)
 * viennent toujours des lignes de la base, jamais d'ici.
 *
 * VUE DE LECTURE UNIQUEMENT : la grille se modifie par navette ZLn
 * (invariant CLAUDE.md — et le jour où un éditeur d'écriture existe, le
 * rejeu de ZL1 devient interdit).
 */

import {
  freeDeliveryThresholdForZone,
  type FreeDeliveryRule,
} from "./rule";

export type ZoneRow = {
  postal_code: string;
  city: string | null;
  delivery_fee: number;
  min_order_amount: number;
};

export type LigneZone = {
  postal_code: string;
  city: string;
  delivery_fee: number;
  /** fee ≤ 0 : livraison toujours offerte (exception Chailly) — pas de
   * seuil de gratuité, il n'y a rien à offrir. */
  offerteDOffice: boolean;
};

export type Anneau = {
  lettre: string;
  /** Plage éditoriale (« 0-4 km ») — null si le minimum sort de la
   * grille connue. */
  plageKm: string | null;
  minOrderAmount: number;
  /** Seuil de gratuité via freeDeliveryThresholdForZone (la dérivation
   * CANONIQUE de rule.ts — jamais re-écrite ici) si la règle est ACTIVE
   * et que l'anneau contient au moins une zone à frais non nuls — null
   * sinon (toggle OFF : on le DIT plutôt que d'afficher des seuils
   * inactifs). */
  seuilGratuite: number | null;
  zones: LigneZone[];
};

/** Habillage éditorial des anneaux ZL1 — jamais une valeur tarifaire. */
const PLAGES_KM: Record<number, string> = {
  25: "0-4 km",
  35: "4-8 km",
  45: "8-12 km",
  55: "12-16 km",
};

const LETTRES = "ABCDEFGH";

export function groupeParAnneaux(
  zones: ZoneRow[],
  /** La règle ENREGISTRÉE (issue de toFreeDeliveryRule) — null tant que
   * rien n'est chargé : aucun seuil affiché. */
  rule: FreeDeliveryRule | null,
): Anneau[] {
  const parMin = new Map<number, LigneZone[]>();
  for (const z of zones) {
    const min = Number(z.min_order_amount);
    const fee = Number(z.delivery_fee);
    if (!Number.isFinite(min) || !Number.isFinite(fee)) continue;
    const ligne: LigneZone = {
      postal_code: String(z.postal_code),
      city: z.city ?? "",
      delivery_fee: fee,
      offerteDOffice: fee <= 0,
    };
    const liste = parMin.get(min);
    if (liste) liste.push(ligne);
    else parMin.set(min, [ligne]);
  }

  // Décision d'AFFICHAGE seulement — le calcul du seuil, lui, appartient
  // à freeDeliveryThresholdForZone (l'offset > 0 est déjà garanti par
  // toFreeDeliveryRule en amont).
  const actif = rule != null && rule.enabled;

  return [...parMin.keys()]
    .sort((a, b) => a - b)
    .map((min, i) => {
      const liste = parMin.get(min)!;
      // Ordre demandé : alphabétique de la localité dans l'anneau (les
      // accents comptent comme leur lettre de base), NPA en départage.
      liste.sort(
        (a, b) =>
          a.city.localeCompare(b.city, "fr", { sensitivity: "base" }) ||
          a.postal_code.localeCompare(b.postal_code),
      );
      return {
        lettre: LETTRES[i] ?? String(i + 1),
        plageKm: PLAGES_KM[min] ?? null,
        minOrderAmount: min,
        seuilGratuite:
          actif && liste.some((z) => !z.offerteDOffice)
            ? freeDeliveryThresholdForZone(min, rule!)
            : null,
        zones: liste,
      };
    });
}
