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

/**
 * Tolérance : avis posté un peu AVANT la déclaration, accepté quand même
 * (le client poste PUIS déclare). ⚠️ Cette tolérance n'est sûre QUE
 * combinée au snapshot seen_review_ids (anti-vol : un avis déjà public à
 * la déclaration n'est jamais matchable). Sans snapshot (provider
 * injoignable au POST), on retombe sur la tolérance RÉDUITE ci-dessous.
 */
export const MATCH_BEFORE_TOLERANCE_MS = 60 * 60 * 1000; // 1 h
/** Tolérance amont de REPLI quand aucun snapshot n'a pu être pris. */
export const MATCH_BEFORE_TOLERANCE_NO_SNAPSHOT_MS = 10 * 60 * 1000; // 10 min

/** Fenêtre de re-checks avant expiration de la requête. */
export const REQUEST_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

/** Intervalle minimum entre deux re-checks API (settle-on-read borné). */
export const RECHECK_MIN_INTERVAL_MS = 2 * 60 * 1000; // 2 min

export function normalizeName(raw: string): string {
  return (
    raw
      .normalize("NFD")
      // Combining Diacritical Marks — plage en échappements \u pour
      // survivre à tout ré-encodage du fichier (relecture 14.08).
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      // Casse turque : « Işık » (Google) vs « ışık » (saisie) — le ı sans
      // point (U+0131) ne se réconcilie ni par toLowerCase ni par NFD.
      // Clientèle Rialto directement concernée (relecture 14.08).
      .replace(/ı/g, "i")
      .replace(/\s+/g, " ")
      .trim()
  );
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
  /**
   * reviewId déjà publics AU MOMENT de la déclaration (snapshot) :
   * JAMAIS matchables — c'est la parade au vol d'avis (le nom d'un avis
   * public n'est un secret pour personne). null = pas de snapshot →
   * tolérance amont réduite en compensation.
   */
  seenReviewIds: string[] | null,
): PublishedReview | null {
  const cible = normalizeName(declaredName);
  if (!cible) return null;
  const declaredMs = new Date(declaredAtIso).getTime();
  if (!Number.isFinite(declaredMs)) return null;
  const tolerance =
    seenReviewIds === null
      ? MATCH_BEFORE_TOLERANCE_NO_SNAPSHOT_MS
      : MATCH_BEFORE_TOLERANCE_MS;
  const seuil = declaredMs - tolerance;
  const exclus = new Set(seenReviewIds ?? []);

  const candidats = reviews
    .filter((r) => {
      const t = new Date(r.publishedAt).getTime();
      return (
        Number.isFinite(t) &&
        t >= seuil &&
        !exclus.has(r.id) &&
        normalizeName(r.authorName) === cible
      );
    })
    .sort(
      (a, b) =>
        new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime(),
    );

  return candidats[0] ?? null;
}
