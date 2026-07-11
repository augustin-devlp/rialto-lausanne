import type {
  MenuItemFull,
  UpsellContext,
  UpsellCandidate,
  UpsellResponse,
  UpsellSuggestion,
} from './types';
import { analyzeCart } from './cartAnalysis';
import { fetchFullMenu } from './supabaseMenu';
import { passesHardFilters, scoreItem, decideSuggestionBudget } from './scoring';
import { callGeminiForMessages } from './geminiCall';

/**
 * Orchestrateur principal : panier + contexte → suggestions.
 * - Analyse du panier
 * - Chargement menu complet (cache 30s)
 * - Filtres durs
 * - Scoring
 * - Top-K (5) envoyé à Gemini pour wording + possible down-trim
 * - Plafond décidé par decideSuggestionBudget
 */
export async function generateUpsell(
  cart: MenuItemFull[],
  context: UpsellContext,
): Promise<UpsellResponse> {
  const analysis = analyzeCart(cart);

  // Panier vide → 0 dès le départ, pas besoin de fetch menu
  if (analysis.totalItems === 0) {
    return { suggestions: [] };
  }

  // Phase 12 V3 — F1 : repas complet → 0 suggestion (BUG #2)
  if (analysis.isFullMeal) {
    return {
      suggestions: [],
      debug: {
        analysis: { isFullMeal: true, hasMain: analysis.hasMain, hasDessert: analysis.hasDessert, hasDrink: analysis.hasDrink, hasStarter: analysis.hasStarter },
        context: { timeOfDay: context.timeOfDay },
        shortlist: [],
      },
    };
  }

  // Phase 12 V3 — F2 : panier ULTRA gros (>=8 items) → 0
  if (analysis.totalItems >= 8) {
    return { suggestions: [], debug: { analysis: { totalItems: analysis.totalItems }, context: {}, shortlist: [] } };
  }

  const menu = await fetchFullMenu();

  // Filtres durs + scoring
  const scored: UpsellCandidate[] = [];
  for (const item of menu) {
    if (!passesHardFilters(item, analysis, context)) continue;
    const { score, reasons } = scoreItem(item, analysis, context);
    if (score > 0) scored.push({ item, score, reasons });
  }

  // Tri desc
  scored.sort((a, b) => b.score - a.score);

  // Diversité de rôles dans le top 5 (ne jamais proposer 2 suggestions
  // du même rôle — drink_soft + drink_soft casse la pertinence).
  const diverseTop: UpsellCandidate[] = [];
  const seenRoles = new Set<string>();
  if (scored.length > 0) {
    diverseTop.push(scored[0]);
    seenRoles.add(scored[0].item.dish_role);
  }
  // Positions 2..5 : exige rôle différent
  for (let i = 1; i < scored.length && diverseTop.length < 5; i++) {
    const c = scored[i];
    if (seenRoles.has(c.item.dish_role)) continue;
    diverseTop.push(c);
    seenRoles.add(c.item.dish_role);
  }
  // Si pas assez d'items diversifiés (menu pauvre) on complète avec les
  // meilleurs restants sans contrainte de rôle
  if (diverseTop.length < 5) {
    for (const c of scored) {
      if (diverseTop.length >= 5) break;
      if (diverseTop.includes(c)) continue;
      diverseTop.push(c);
    }
  }

  // Budget (0/1/2) - puis plafond dynamique V3 BUG #4
  let budget = decideSuggestionBudget(analysis, diverseTop);
  // Cap à 1 si panier déjà chargé (>=6 items, ou 2+ mains, ou 2+ boissons)
  const totalMains = analysis.roleCount.main + analysis.roleCount.combo;
  const totalDrinks = analysis.roleCount.drink_soft + analysis.roleCount.drink_alcohol;
  if (analysis.totalItems >= 6 || totalMains >= 2 || totalDrinks >= 2) {
    budget = Math.min(budget, 1);
  }
  if (budget === 0) {
    return {
      suggestions: [],
      debug: {
        analysis: { hasMain: analysis.hasMain, hasDessert: analysis.hasDessert, hasDrink: analysis.hasDrink, dominantCuisine: analysis.dominantCuisine },
        context: { timeOfDay: context.timeOfDay, isWeekend: context.isWeekend },
        shortlist: diverseTop.slice(0, 5).map((c) => ({ id: c.item.id, name: c.item.name, score: c.score })),
      },
    };
  }

  // Gemini wording (sur les top `budget`)
  const topForGemini = diverseTop.slice(0, Math.max(budget, 2));
  const messages = await callGeminiForMessages(topForGemini, analysis, context, budget);

  // Assemble UpsellSuggestion[]
  const suggestions: UpsellSuggestion[] = [];
  for (const m of messages) {
    const cand = topForGemini.find((c) => c.item.id === m.menu_item_id);
    if (!cand) continue;
    suggestions.push({
      menu_item_id: cand.item.id,
      name: cand.item.name,
      price: cand.item.price,
      image_url: cand.item.image_url,
      message: m.message,
      category: cand.item.dish_role,
      score: cand.score,
      reasons: cand.reasons,
    });
    if (suggestions.length >= budget) break;
  }

  // Si Gemini en a renvoyé moins que budget, on complète avec fallback direct
  if (suggestions.length < budget) {
    for (const c of topForGemini) {
      if (suggestions.some((s) => s.menu_item_id === c.item.id)) continue;
      if (suggestions.length >= budget) break;
      suggestions.push({
        menu_item_id: c.item.id,
        name: c.item.name,
        price: c.item.price,
        image_url: c.item.image_url,
        message: 'Parfait avec ta commande.',
        category: c.item.dish_role,
        score: c.score,
        reasons: c.reasons,
      });
    }
  }

  return {
    suggestions,
    debug: {
      analysis: {
        hasMain: analysis.hasMain,
        hasDessert: analysis.hasDessert,
        hasDrink: analysis.hasDrink,
        dominantCuisine: analysis.dominantCuisine,
        isHeavyMeal: analysis.isHeavyMeal,
        hasSpicyItem: analysis.hasSpicyItem,
        estimatedPax: analysis.estimatedPax,
      },
      context: {
        timeOfDay: context.timeOfDay,
        isWeekend: context.isWeekend,
        season: context.season,
        vipTier: context.vipTier,
        blacklistedCategories: context.blacklistedCategories,
      },
      shortlist: diverseTop.slice(0, 5).map((c) => ({ id: c.item.id, name: c.item.name, score: c.score })),
    },
  };
}
