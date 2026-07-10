import type { CartAnalysis, MenuItemFull, DishRole, CuisineStyle } from './types';

/**
 * Analyse profonde du panier — base de toute décision downstream (candidates + scoring).
 * Pure function, zéro I/O.
 */
export function analyzeCart(items: MenuItemFull[]): CartAnalysis {
  const a: CartAnalysis = {
    totalItems: 0, totalPrice: 0,
    roleCount: { starter: 0, main: 0, side: 0, dessert: 0, drink_soft: 0, drink_alcohol: 0, combo: 0 },
    hasStarter: false, hasMain: false, hasDessert: false,
    hasDrink: false, hasAlcohol: false, hasSoftDrink: false,
    maxHeatLevel: 0, avgRichnessLevel: 0, totalCaloricDensity: 0,
    isHeavyMeal: false, isLightMeal: false,
    cuisineDistribution: {}, dominantCuisine: 'mixed',
    mainProtein: 'none', allVegetarian: true,
    anyPork: false, anyAlcohol: false,
    estimatedPax: 1, isSolo: false, isDuo: false, isFamily: false, isGroup: false,
    hasSpicyItem: false, hasSignatureItem: false, hasSeafood: false,
    isFullMeal: false, hasAnyDrink: false, hasFriesIncluded: false,
    itemIds: new Set(), itemNames: [],
    allUpsellTags: new Set(), expectedPairings: new Set(), forbiddenPairings: new Set()
  };

  if (items.length === 0) return a;

  let richSum = 0;
  let totalQty = 0;
  const proteinCount: Record<string, number> = {};

  for (const it of items) {
    const q = it.quantity || 1;
    totalQty += q;
    a.totalItems += q;
    a.totalPrice += Number(it.price) * q;
    a.itemIds.add(it.id);
    a.itemNames.push(it.name);

    const role = it.dish_role;
    if (a.roleCount[role] !== undefined) a.roleCount[role] += q;

    a.maxHeatLevel = Math.max(a.maxHeatLevel, it.heat_level || 0);
    richSum += (it.richness_level || 2) * q;
    a.totalCaloricDensity += (it.caloric_density || 3) * q;

    const cuisine = it.cuisine_style;
    a.cuisineDistribution[cuisine] = (a.cuisineDistribution[cuisine] || 0) + q;

    if (it.main_ingredient && it.main_ingredient !== 'none') {
      proteinCount[it.main_ingredient] = (proteinCount[it.main_ingredient] || 0) + q;
    }

    if (!it.is_vegetarian) a.allVegetarian = false;
    if (it.contains_pork) a.anyPork = true;
    if (it.contains_alcohol) a.anyAlcohol = true;

    a.estimatedPax = Math.max(a.estimatedPax, (it.serves_pax || 1) * q);

    if ((it.heat_level || 0) >= 3) a.hasSpicyItem = true;
    if ((it.semantic_tags || []).some((t) => t.includes('signature'))) a.hasSignatureItem = true;
    if (it.main_ingredient === 'fish' || it.main_ingredient === 'seafood') a.hasSeafood = true;

    (it.upsell_tags || []).forEach((t) => a.allUpsellTags.add(t));
    (it.pairs_well_with_ids || []).forEach((id) => a.expectedPairings.add(id));
    (it.avoid_with_ids || []).forEach((id) => a.forbiddenPairings.add(id));
  }

  a.hasStarter = a.roleCount.starter > 0;
  a.hasMain = a.roleCount.main > 0 || a.roleCount.combo > 0;
  a.hasDessert = a.roleCount.dessert > 0;
  a.hasSoftDrink = a.roleCount.drink_soft > 0;
  a.hasAlcohol = a.roleCount.drink_alcohol > 0;
  a.hasDrink = a.hasSoftDrink || a.hasAlcohol;
  if (a.roleCount.combo > 0) a.hasDrink = true;

  // Phase 12 V3 — détecteurs robustes pour les filtres durs
  a.hasAnyDrink = a.hasSoftDrink || a.hasAlcohol || a.roleCount.combo > 0;
  a.hasFriesIncluded =
    a.allUpsellTags.has('fries_included') || a.roleCount.side > 0;
  // isFullMeal = repas complet (starter + main + drink + dessert)
  a.isFullMeal = a.hasStarter && a.hasMain && a.hasAnyDrink && a.hasDessert;

  a.avgRichnessLevel = totalQty > 0 ? richSum / totalQty : 0;
  a.isHeavyMeal = a.avgRichnessLevel >= 4 || a.totalCaloricDensity >= 10;
  a.isLightMeal = a.avgRichnessLevel <= 1.5 && totalQty <= 2;

  const topCuisine = Object.entries(a.cuisineDistribution).sort((x, y) => y[1] - x[1])[0];
  if (topCuisine && topCuisine[1] / totalQty >= 0.66) {
    a.dominantCuisine = topCuisine[0] as CuisineStyle;
  }

  const topProtein = Object.entries(proteinCount).sort((x, y) => y[1] - x[1])[0];
  a.mainProtein = topProtein ? topProtein[0] : a.allVegetarian ? 'vegetarian' : 'none';

  // Social : base = estimatedPax (plat x serves_pax), surcouche si plusieurs mains
  const totalMainish = a.roleCount.main + a.roleCount.combo;
  if (totalMainish >= 3) a.estimatedPax = Math.max(a.estimatedPax, totalMainish);

  a.isSolo = a.estimatedPax === 1;
  a.isDuo = a.estimatedPax === 2;
  a.isFamily = a.estimatedPax >= 3 && a.estimatedPax <= 5;
  a.isGroup = a.estimatedPax >= 5;

  return a;
}
