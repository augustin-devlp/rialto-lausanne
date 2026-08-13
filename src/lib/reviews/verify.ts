/**
 * Matching déclaration ↔ avis publié (calcul pur, testable sans réseau).
 *
 * Règles :
 *   - NOM : comparaison normalisée (casse, accents, espaces multiples) —
 *     le client tape « jean dupont », Google affiche « Jean Dupont ».
 *     Égalité STRICTE après normalisation : pas de fuzzy matching, un
 *     faux positif débloquerait la roue sur l'avis d'un inconnu.
 *   - DATE : l'avis doit être publié APRÈS la déclaration (cadrage :
 *     « apparu après la commande »), avec une tolérance courte en amont —
 *     le client qui poste son avis PUIS déclare son nom dans la foulée ne
 *     doit pas être refusé pour quelques minutes d'ordre inverse.
 *
 * « 1 avis = 1 roue max » n'est PAS vérifié ici : c'est la contrainte
 * UNIQUE de google_review_claims (business_id, review_author_name,
 * review_time) qui le garantit à l'INSERT du claim — un même avis re-matché
 * échoue en 23505, le code traite ce cas comme « déjà utilisé ».
 */

import type { PublishedReview } from "./provider";

/** Tolérance : avis posté un peu AVANT la déclaration, accepté quand même. */
export const MATCH_BEFORE_TOLERANCE_MS = 60 * 60 * 1000; // 1 h

/** Fenêtre de re-checks avant expiration de la requête. */
export const REQUEST_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/** Intervalle minimum entre deux re-checks API (settle-on-read borné). */
export const RECHECK_MIN_INTERVAL_MS = 2 * 60 * 1000; // 2 min

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cherche l'avis qui matche la déclaration. Retourne le PLUS ANCIEN des
 * avis correspondants (déterministe si l'auteur a plusieurs avis — cas
 * limite, Google n'en garde qu'un par fiche en pratique).
 */
export function matchReview(
  reviews: PublishedReview[],
  declaredName: string,
  declaredAtIso: string,
): PublishedReview | null {
  const cible = normalizeName(declaredName);
  if (!cible) return null;
  const declaredMs = new Date(declaredAtIso).getTime();
  if (!Number.isFinite(declaredMs)) return null;
  const seuil = declaredMs - MATCH_BEFORE_TOLERANCE_MS;

  const candidats = reviews
    .filter((r) => {
      const t = new Date(r.publishedAt).getTime();
      return (
        Number.isFinite(t) && t >= seuil && normalizeName(r.authorName) === cible
      );
    })
    .sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
    );

  return candidats[0] ?? null;
}
