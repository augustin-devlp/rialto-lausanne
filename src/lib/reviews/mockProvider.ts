/**
 * Provider MOCK — développement et QA du flux sans l'accès Google.
 *
 * Les avis simulés se posent via la variable d'env MOCK_REVIEWS_JSON :
 *   MOCK_REVIEWS_JSON='[{"id":"r1","authorName":"Jean Test","publishedAt":"2026-08-14T12:00:00Z"}]'
 * Vide/absente → aucun avis (le flux « en cours de publication » se
 * teste ainsi) ; malformée → throw (comme un échec API réel).
 *
 * JAMAIS actif en production réelle : le sélecteur (index.ts) ne le
 * choisit que si REVIEW_GATE_MODE=mock, posé uniquement en préprod/QA.
 */

import type { PublishedReview, ReviewProvider } from "./provider";

export class MockReviewProvider implements ReviewProvider {
  readonly name = "mock";

  listRecentReviews(): Promise<PublishedReview[]> {
    const raw = process.env.MOCK_REVIEWS_JSON;
    if (!raw || !raw.trim()) return Promise.resolve([]);
    const parsed = JSON.parse(raw) as PublishedReview[];
    if (!Array.isArray(parsed)) {
      throw new Error("MOCK_REVIEWS_JSON doit être un tableau");
    }
    return Promise.resolve(
      parsed.filter(
        (r) =>
          typeof r?.id === "string" &&
          typeof r?.authorName === "string" &&
          typeof r?.publishedAt === "string",
      ),
    );
  }
}
