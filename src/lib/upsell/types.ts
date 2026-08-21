/**
 * Upsell Monstre — types partagés (Phase 12).
 */

export type DishRole = 'starter' | 'main' | 'side' | 'dessert' | 'drink_soft' | 'drink_alcohol' | 'combo';
export type CuisineStyle = 'italian' | 'anatolian' | 'french' | 'fusion' | 'universal';

export interface MenuItemFull {
  id: string;
  name: string;
  price: number;
  /** Pondération de marge par catégorie (v2), CHECK 0.5–2.0 en base, défaut 1.0. */
  margin_weight: number;
  image_url?: string;
  is_available: boolean;
  is_out_of_stock: boolean;
  category_id: string;
  heat_level: number;
  richness_level: number;
  saltiness_level: number;
  sweetness_level: number;
  acidity_level: number;
  caloric_density: number;
  fat_level: number;
  dish_role: DishRole;
  cuisine_style: CuisineStyle;
  main_ingredient: string;
  is_vegetarian: boolean;
  contains_pork: boolean;
  contains_alcohol: boolean;
  serves_pax: number;
  is_shareable: boolean;
  ideal_time_of_day: string[];
  upsell_tags: string[];
  pairs_well_with_ids: string[];
  avoid_with_ids: string[];
  semantic_tags: string[];
  quantity?: number;
}

export interface CartAnalysis {
  totalItems: number;
  totalPrice: number;
  roleCount: Record<DishRole, number>;
  hasStarter: boolean;
  hasMain: boolean;
  hasDessert: boolean;
  hasDrink: boolean;
  hasAlcohol: boolean;
  hasSoftDrink: boolean;
  maxHeatLevel: number;
  avgRichnessLevel: number;
  totalCaloricDensity: number;
  isHeavyMeal: boolean;
  isLightMeal: boolean;
  cuisineDistribution: Record<string, number>;
  dominantCuisine: CuisineStyle | 'mixed';
  mainProtein: string;
  allVegetarian: boolean;
  anyPork: boolean;
  anyAlcohol: boolean;
  estimatedPax: number;
  isSolo: boolean;
  isDuo: boolean;
  isFamily: boolean;
  isGroup: boolean;
  hasSpicyItem: boolean;
  hasSignatureItem: boolean;
  hasSeafood: boolean;
  /** Phase 12 V3 — repas complet : starter + main + drink + dessert tous présents. */
  isFullMeal: boolean;
  /** Phase 12 V3 — au moins une boisson au panier (soft + alcool + combo qui inclut). */
  hasAnyDrink: boolean;
  /** Phase 12 V3 — fries déjà incluses (hamburgers + side). */
  hasFriesIncluded: boolean;
  itemIds: Set<string>;
  /** Catégories présentes au panier. Nécessaire aux interdictions dures qui
   *  dépendent de ce qu'il y a DÉJÀ dans le panier (pizza → jamais de
   *  frites) : `passesHardFilters` ne reçoit pas les articles, seulement
   *  cette analyse. */
  categoryIds: Set<string>;
  itemNames: string[];
  allUpsellTags: Set<string>;
  expectedPairings: Set<string>;
  forbiddenPairings: Set<string>;
}

export type TimeOfDay = 'lunch' | 'afternoon' | 'dinner' | 'late_night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Palier de livraison offerte, RÉSOLU CÔTÉ SERVEUR. */
export interface PalierLivraison {
  /** Reste à ajouter pour franchir (> 0 : pas encore atteint). */
  remaining: number;
  /** Frais de livraison de la zone, supprimés au franchissement. */
  delivery_fee: number;
}

/** Écart au MINIMUM de commande de la zone, résolu côté serveur.
 *  Ce n'est PAS un palier d'avantage : sans lui, la commande est REFUSÉE. */
export interface EcartMinimum {
  /** Reste à ajouter pour atteindre le minimum (> 0 : panier bloqué). */
  remaining: number;
  /** Le minimum de la zone, pour le message. */
  minimum: number;
}

export interface UpsellContext {
  timeOfDay: TimeOfDay;
  season: Season;
  dayOfWeek: number;
  isWeekend: boolean;
  hour: number;
  customerId?: string;
  customerName?: string;
  customerAge?: number;
  isBirthdayWeek?: boolean;
  vipTier?: 'bronze' | 'silver' | 'gold';
  customerLastOrderedIds: string[];
  customerTopCategoryIds: string[];
  blacklistedCategories: string[];
  /** Palier de livraison offerte, résolu SERVEUR depuis le code postal.
   *  `null` = pas d'adresse, zone à frais nul, ou toggle coupé. */
  palierLivraison?: PalierLivraison | null;
  /** Écart au minimum de commande de la zone, résolu SERVEUR.
   *  `null` = pas d'adresse, ou minimum déjà atteint. */
  ecartMinimum?: EcartMinimum | null;
}

export interface UpsellCandidate {
  item: MenuItemFull;
  score: number;
  reasons: string[];
}

export interface UpsellSuggestion {
  menu_item_id: string;
  name: string;
  price: number;
  image_url?: string;
  message: string;
  category: string;
  score: number;
  reasons: string[];
  /**
   * Économie liée au franchissement d'un PALIER (chemin P2). Présent
   * UNIQUEMENT quand la suggestion fait franchir le seuil de livraison
   * offerte. Le panneau s'en sert pour afficher le COÛT NET et sa
   * décomposition — condition de véracité ② d'Augustin : la décomposition
   * s'affiche TOUJOURS, jamais le coût net seul.
   */
  palier?: {
    /** Ce qu'il manquait pour franchir le seuil. */
    ecart: number;
    /** Frais de livraison que le franchissement supprime. */
    frais_economises: number;
    /** prix − frais économisés. Peut être NÉGATIF : la facture baisse. */
    cout_net: number;
  } | null;
  /** Le CHEMIN qui a déclenché cette suggestion (P3, P4…), ou null si c'est
   *  le scoreur historique. Augustin n'a aucun historique de commandes : les
   *  associations sont écrites à la main et seront approximatives au début.
   *  Sans ce champ, on saura dans trois mois QUE le moteur se trompe, mais
   *  jamais SUR QUEL CHEMIN. C'est la seule chose qui rendra la correction
   *  possible — ne pas le retirer. */
  chemin?: string | null;
}

export interface UpsellResponse {
  suggestions: UpsellSuggestion[];
  /** Renseigné par P7 quand le panier est SOUS LE MINIMUM de zone et
   *  qu'aucun article seul ne comble l'écart. À afficher tel quel, sans
   *  proposer d'article : le client est bloqué, il doit savoir de combien. */
  blocage?: { manque: number } | null;
  debug?: {
    analysis: Partial<CartAnalysis>;
    context: Partial<UpsellContext>;
    shortlist: { id: string; name: string; score: number }[];
  };
}
