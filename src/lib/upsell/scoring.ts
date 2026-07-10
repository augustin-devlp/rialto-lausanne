import type { CartAnalysis, MenuItemFull, UpsellContext, UpsellCandidate, DishRole } from './types';

/**
 * Filtres durs (hard filters) — un plat qui ne passe pas est éliminé.
 * On ne négocie pas la cohérence culturelle, diététique, la redondance et le bon sens.
 */
export function passesHardFilters(
  item: MenuItemFull,
  analysis: CartAnalysis,
  context: UpsellContext,
): boolean {
  // RÈGLE MÉTIER RIALTO (absolue, CLAUDE.md) : JAMAIS d'alcool en upsell.
  // Écart assumé vs Stampify (qui ne bloquait qu'au déjeuner en semaine et
  // boostait l'alcool au dîner) — décision D1 du lot 9.
  // cast `as string` : sans lui, TS "narrow" dish_role et exclut 'drink_alcohol'
  // pour la suite de la fonction, ce qui casse le filtre BUG #3 verbatim plus bas
  // qui compare encore item.dish_role à 'drink_alcohol'. Zéro effet runtime.
  if (item.contains_alcohol || (item.dish_role as string) === "drink_alcohol") return false;

  // 1. Déjà au panier
  if (analysis.itemIds.has(item.id)) return false;

  // 2. Hors stock / indispo
  if (!item.is_available || item.is_out_of_stock) return false;

  // 3. Explicitement interdit par un plat du panier (avoid_with_ids)
  if (analysis.forbiddenPairings.has(item.id)) return false;

  // 4. Un plat du panier est dans avoid_with_ids de cet item ?
  if ((item.avoid_with_ids || []).some((id) => analysis.itemIds.has(id))) return false;

  // 5. Dismissal learning : catégorie blacklistée
  const cats = [item.dish_role, ...(item.upsell_tags || []), item.cuisine_style];
  if (context.blacklistedCategories.some((b) => cats.includes(b))) return false;

  // 6. Panier 100% végétarien → pas de viande/poisson dans la suggestion principale
  //    (on laisse passer fromage, légumes, boissons, desserts)
  if (analysis.allVegetarian && !item.is_vegetarian) return false;

  // 7. Anti-pork si panier anatolien/halal signal
  //    Heuristique : si panier contient tajine/kavurma/turca ou cuisine dominante anatolian ET pas de porc déjà dedans
  const isAnatolianPanier =
    analysis.dominantCuisine === 'anatolian' && !analysis.anyPork;
  if (isAnatolianPanier && item.contains_pork) return false;

  // 8. (retiré — D1 lot 9 : alcool bloqué inconditionnellement en tête de fonction)

  // 9. Cohérence culturelle fine : panier italien dominant → pas vin turc
  if (analysis.dominantCuisine === 'italian' && (item.upsell_tags || []).includes('turkish_wine')) {
    return false;
  }
  // Inverse : panier anatolien → pas vin italien
  if (analysis.dominantCuisine === 'anatolian' && (item.upsell_tags || []).includes('italian_wine')) {
    return false;
  }

  // 10. Redondance role :
  //     V3 — durci pour fix BUG #3 (2 boissons) et BUG #4 (2 mains).
  if (analysis.hasDessert && item.dish_role === 'dessert') return false;
  if (analysis.hasStarter && item.dish_role === 'starter' && !analysis.isFamily && !analysis.isGroup) return false;

  // BUG #3 V3 : si AU MOINS UNE boisson au panier (soft, alcool, ou combo
  // qui inclut une boisson) → JAMAIS proposer une autre boisson (soft ou alcool).
  if (analysis.hasAnyDrink && (item.dish_role === 'drink_soft' || item.dish_role === 'drink_alcohol')) {
    return false;
  }

  // BUG #4 V3 : déjà 2+ mains (main+combo confondus) → JAMAIS un 3e main/combo.
  const totalMainsAndCombos = analysis.roleCount.main + analysis.roleCount.combo;
  if (totalMainsAndCombos >= 2 && (item.dish_role === 'main' || item.dish_role === 'combo')) {
    return false;
  }

  // 11. Side redondant : pas de frites si panier contient déjà des fries (via fries_included flag)
  //     Ce cas est déjà géré par avoid_with_ids mais double-barrière.
  if (item.dish_role === 'side' && (analysis.allUpsellTags.has('fries_included') || analysis.roleCount.side > 0)) {
    return false;
  }

  // 12. Si panier = repas complet (starter + main + dessert + drink) → pas de suggestion
  //     (filtre géré au niveau du générateur, pas ici)

  return true;
}

/**
 * Scoring par règles (heuristique pure, sans IA).
 * Le top-K est ensuite envoyé à Gemini pour tri final + wording.
 */
export function scoreItem(
  item: MenuItemFull,
  analysis: CartAnalysis,
  context: UpsellContext,
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // 1. Pairing explicite (pré-calculé en DB) — gros boost
  if (analysis.expectedPairings.has(item.id)) {
    score += 40;
    reasons.push('pairing_explicit');
  }

  // 2. Role ciblé — combler les trous du repas
  if (!analysis.hasDrink && item.dish_role === 'drink_soft') {
    score += 25;
    reasons.push('role_fill_drink_soft');
  }
  // D1 (lot 9) : boost role_fill_drink_alcohol_dinner retiré — code mort, l'alcool ne passe plus les filtres durs (JAMAIS d'alcool en upsell).
  if (analysis.hasMain && !analysis.hasDessert && item.dish_role === 'dessert') {
    score += 28;
    reasons.push('role_fill_dessert');
  }
  if (!analysis.hasMain && item.dish_role === 'main') {
    score += 35;
    reasons.push('role_fill_main');
  }
  if (!analysis.hasStarter && !analysis.hasMain && item.dish_role === 'starter') {
    score += 15;
    reasons.push('role_fill_starter');
  }
  // Salade seule : la vraie suggestion c'est un main
  if (analysis.isLightMeal && !analysis.hasMain && item.dish_role === 'main') {
    score += 30;
    reasons.push('light_meal_upgrade_to_main');
  }

  // 3. Cohérence cuisine (+10) ou cuisine universelle (neutre)
  if (analysis.dominantCuisine !== 'mixed' && item.cuisine_style === analysis.dominantCuisine) {
    score += 12;
    reasons.push('cuisine_match');
  } else if (item.cuisine_style === 'universal') {
    score += 3;
    reasons.push('cuisine_universal');
  }

  // 4. Piquant → refreshing
  if (analysis.hasSpicyItem) {
    if ((item.upsell_tags || []).includes('spicy_pairing') || (item.upsell_tags || []).includes('very_refreshing') || (item.upsell_tags || []).includes('refreshing') || (item.upsell_tags || []).includes('lemonade') || (item.upsell_tags || []).includes('iced_tea')) {
      score += 20;
      reasons.push('cools_spicy');
    }
    // Pénalité vin rouge sur piquant
    if ((item.upsell_tags || []).includes('red_wine')) {
      score -= 12;
      reasons.push('penalty_red_wine_on_spicy');
    }
  }

  // 5. Social : shareable si famille/groupe (boost fort pour surpasser
  //    le cools_spicy qui pourrait sinon attirer une boisson individuelle)
  if ((analysis.isFamily || analysis.isGroup) && item.is_shareable) {
    score += 25;
    reasons.push('family_shareable');
  }
  if ((analysis.isFamily || analysis.isGroup) && (item.upsell_tags || []).includes('family_size')) {
    score += 22;
    reasons.push('family_size_match');
  }
  // Dessert shareable pour groupe = encore plus pertinent
  if ((analysis.isFamily || analysis.isGroup) && item.dish_role === 'dessert' && item.is_shareable) {
    score += 10;
    reasons.push('family_dessert_shareable');
  }

  // 6. Temporel : ideal_time_of_day match
  if ((item.ideal_time_of_day || []).includes(context.timeOfDay)) {
    score += 6;
    reasons.push('time_of_day_match');
  } else if ((item.ideal_time_of_day || []).includes('anytime')) {
    score += 2;
  }

  // 7. Été → glacé / très rafraîchissant
  if (context.season === 'summer') {
    const s = new Set(item.upsell_tags || []);
    if (s.has('cooling') || s.has('very_refreshing') || s.has('summer')) {
      score += 8;
      reasons.push('summer_boost');
    }
  }

  // 8. Signature — VIP Gold ou anniversaire
  if ((item.semantic_tags || []).some((t) => t.includes('signature')) || (item.upsell_tags || []).includes('signature')) {
    if (context.vipTier === 'gold' || context.vipTier === 'silver') {
      score += 18;
      reasons.push('vip_signature_boost');
    } else if (context.isBirthdayWeek) {
      score += 15;
      reasons.push('birthday_signature_boost');
    } else if (analysis.hasSignatureItem) {
      // Déjà un signature dans le panier — pas besoin d'en ajouter
      score -= 4;
    } else {
      score += 4;
      reasons.push('signature_gentle_boost');
    }
  }

  // 9. Dessert indulgent si lourd + anniv/weekend
  if (analysis.isHeavyMeal && item.dish_role === 'dessert') {
    score += 8;
    reasons.push('dessert_after_heavy');
  }

  // 10. Historique client : plat déjà commandé 2+ fois → gros boost
  if (context.customerLastOrderedIds.length > 0) {
    const freq = context.customerLastOrderedIds.filter((id) => id === item.id).length;
    if (freq >= 2) {
      score += 20;
      reasons.push('customer_favorite');
    } else if (freq >= 1) {
      score += 6;
      reasons.push('customer_known');
    }
  }

  // 11. Prix raisonnable vs panier — pas de boisson plus chère que le main
  //     Soft penalty si suggestion > 50% du panier total
  if (analysis.totalPrice > 0 && Number(item.price) > analysis.totalPrice * 0.6) {
    score -= 4;
    reasons.push('expensive_vs_cart');
  }

  // 12. Lien semantic_tags anatolian-pride si panier anatolien
  if (analysis.dominantCuisine === 'anatolian' && (item.semantic_tags || []).some((t) => t.includes('anatolian'))) {
    score += 6;
    reasons.push('anatolian_pride_match');
  }

  // 13. Main protein diversity : éviter de re-suggérer la même protéine principale
  if (item.dish_role === 'main' && item.main_ingredient === analysis.mainProtein && analysis.mainProtein !== 'vegetarian') {
    score -= 6;
    reasons.push('same_protein_penalty');
  }

  // 14. Kid_friendly si enfants supposés (family >=4 mains)
  if (analysis.isFamily && analysis.roleCount.main >= 3 && (item.upsell_tags || []).includes('kid_friendly')) {
    score += 5;
    reasons.push('family_kid_friendly');
  }

  // Floor
  if (score < 0) score = 0;

  return { score, reasons };
}

/**
 * Décide combien de suggestions renvoyer (0, 1 ou 2) en fonction du panier.
 * Le plafond absolu est 2 mais le minimum peut être 0 (panier complet ou pas de bon candidat).
 */
export function decideSuggestionBudget(
  analysis: CartAnalysis,
  topCandidates: UpsellCandidate[],
): number {
  // Panier vide → 0
  if (analysis.totalItems === 0) return 0;

  // Panier complet starter+main+drink+dessert → 0
  if (analysis.hasStarter && analysis.hasMain && analysis.hasDrink && analysis.hasDessert) return 0;

  // Panier >=5 items → max 1
  if (analysis.totalItems >= 5) {
    return topCandidates.length > 0 && topCandidates[0].score >= 25 ? 1 : 0;
  }

  // Le meilleur candidat doit avoir un score minimum pour qu'on propose quoi que ce soit
  if (topCandidates.length === 0) return 0;
  if (topCandidates[0].score < 15) return 0;

  // 2 candidats si 2 rôles distincts manquent (ex: drink + dessert manquants)
  const missingRoles: DishRole[] = [];
  if (!analysis.hasDrink) missingRoles.push('drink_soft');
  if (analysis.hasMain && !analysis.hasDessert) missingRoles.push('dessert');
  if (!analysis.hasMain && analysis.totalItems <= 2) missingRoles.push('main');
  if (missingRoles.length >= 2) return 2;

  // Famille/groupe : 2 suggestions plus pertinentes (ex: dessert shareable + drink shareable)
  if ((analysis.isFamily || analysis.isGroup) && topCandidates.length >= 2 && topCandidates[1].score >= 25) {
    return 2;
  }

  return 1;
}
