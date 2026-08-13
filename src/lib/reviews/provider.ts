/**
 * Gate avis roue — interface PROVIDER (14.08.2026).
 *
 * Une seule source autorisée en production : l'API OFFICIELLE Google
 * Business Profile (décision Augustin — aucun service tiers, jamais).
 * Le mock n'existe que pour développer et tester le flux complet sans
 * l'accès (qui arrive sous 1-2 semaines : Manager de la fiche → projet
 * Cloud → formulaire d'accès API → credentials posés, rien d'autre).
 *
 * ⚠️ GARDE-FOUS LÉGAUX (à respecter dans TOUTE copie liée à ce module) :
 * on demande UN avis, JAMAIS un avis positif ni « 5 étoiles » ; la
 * récompense est une « chance de gagner » (la roue a des segments
 * perdants), jamais un gain garanti.
 */

export type PublishedReview = {
  /** Identifiant de l'avis chez le provider (reviewId GBP). */
  id: string;
  /** Nom d'affichage public de l'auteur (reviewer.displayName). */
  authorName: string;
  /** Horodatage de publication (createTime GBP), ISO. */
  publishedAt: string;
};

export interface ReviewProvider {
  /** Nom court pour les logs. */
  readonly name: string;
  /**
   * Les avis RÉCENTS de la fiche (les ~50 derniers suffisent : on ne
   * matche que des avis publiés après la déclaration du client).
   * Doit JETER en cas d'échec — l'appelant décide (re-check plus tard),
   * jamais de tableau vide silencieux sur erreur.
   */
  listRecentReviews(): Promise<PublishedReview[]>;
}
