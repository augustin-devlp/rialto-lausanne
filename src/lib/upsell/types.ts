/**
 * Upsell Monstre — types partagés (Phase 12).
 */

export type DishRole = 'starter' | 'main' | 'side' | 'dessert' | 'drink_soft' | 'drink_alcohol' | 'combo';
export type CuisineStyle = 'italian' | 'anatolian' | 'french' | 'fusion' | 'universal';

export interface MenuItemFull {
  id: string;
  name: string;
  price: number;
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
  itemNames: string[];
  allUpsellTags: Set<string>;
  expectedPairings: Set<string>;
  forbiddenPairings: Set<string>;
}

export type TimeOfDay = 'lunch' | 'afternoon' | 'dinner' | 'late_night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

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
}

export interface UpsellResponse {
  suggestions: UpsellSuggestion[];
  debug?: {
    analysis: Partial<CartAnalysis>;
    context: Partial<UpsellContext>;
    shortlist: { id: string; name: string; score: number }[];
  };
}
