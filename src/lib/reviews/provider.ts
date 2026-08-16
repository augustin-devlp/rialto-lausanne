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

/** Résultat d'une lecture avec preuve de couverture (re-validation). */
export type CoveredReviews = {
  avis: PublishedReview[];
  /**
   * true = la liste couvre PROUVABLEMENT tout avis créé à `untilMs` ou
   * après : une absence y vaut suppression. false = couverture non
   * établie (pagination plafonnée) : une absence n'est PAS concluante.
   */
  complete: boolean;
};

export interface ReviewProvider {
  /** Nom court pour les logs. */
  readonly name: string;
  /**
   * Les avis RÉCENTS de la fiche — contrat borné aux ~50 derniers par
   * updateTime : suffisant UNIQUEMENT pour matcher un avis publié après
   * la déclaration du client (tenteVerification, snapshot anti-vol).
   * ⚠️ NE JAMAIS conclure « avis supprimé » depuis une absence dans
   * cette liste (tronquée par construction) — la re-validation passe par
   * listReviewsCovering. Doit JETER en cas d'échec — l'appelant décide
   * (re-check plus tard), jamais de tableau vide silencieux sur erreur.
   */
  listRecentReviews(): Promise<PublishedReview[]>;
  /**
   * Les avis couvrant tout createTime >= untilMs, avec preuve de
   * couverture (re-validation : « l'avis ancré existe-t-il toujours ? »).
   * Critère de complétude côté Google : pagination par updateTime desc
   * jusqu'à min(updateTime) < untilMs — tout avis créé à untilMs ou
   * après a updateTime >= createTime >= untilMs, il serait donc DÉJÀ
   * apparu — ou jusqu'à épuisement de la fiche. Doit JETER sur échec.
   */
  listReviewsCovering(untilMs: number): Promise<CoveredReviews>;
}
