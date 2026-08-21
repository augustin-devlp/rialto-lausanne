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
import { callGeminiForMessages, genericPairingMessage } from './geminiCall';
import { choisitChemin, idsInconnus, panierEstUneTablee } from './chemins';

export const UPSELL_SILENCE_THRESHOLD_CHF = 80; // silence total au-dessus (configurable) — au-delà, suggérer paraît cupide

/**
 * Orchestrateur principal : panier + contexte → suggestions.
 * - Analyse du panier
 * - Chargement menu complet (cache 30s)
 * - Filtres durs
 * - Scoring
 * - Top-K (5) envoyé à Gemini pour wording + possible down-trim
 * - Plafond décidé par decideSuggestionBudget
 */
/**
 * Économie du franchissement de palier, pour UNE suggestion.
 *
 * ⚠️ NE RENVOIE QUELQUE CHOSE QUE POUR LE CHEMIN P2. Les autres chemins ne
 * font franchir aucun seuil : leur attacher une économie serait une
 * promesse fausse. `cout_net` peut être NÉGATIF — c'est le cas vendeur :
 * la facture baisse.
 */
function economiePalier(
  prix: number,
  chemin: ReturnType<typeof choisitChemin>,
): { ecart: number; frais_economises: number; cout_net: number } | null {
  if (!chemin || chemin.chemin !== "P2" || !chemin.palier) return null;
  const frais = chemin.palier.delivery_fee;
  return {
    ecart: chemin.palier.remaining,
    frais_economises: frais,
    cout_net: Math.round((prix - frais) * 100) / 100,
  };
}

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

  // v2 (D2) — garde-fou anti-lourdeur : sous-total > seuil CHF → silence total.
  // Au-delà, suggérer paraît cupide. S'ajoute au court-circuit >=8 items ci-dessus.
  const subtotal = analysis.totalPrice; // déjà pondéré quantité (cartAnalysis)

  // ⚠️ LE MODE TABLÉE IGNORE CE SEUIL (décision Augustin 21.08).
  //
  // Le plafond de 80 CHF a été pensé pour une GROSSE COMMANDE
  // INDIVIDUELLE — au-delà, insister paraît cupide. Il ne vaut pas pour un
  // GROUPE : trois plats, c'est précisément là que le 1.5 l et les formats
  // 11 pièces paient. Constaté en production le 21.08 : trois plats à 29
  // font déjà 87, donc le mode le plus rentable du moteur était muet
  // exactement sur les tablées les plus chères.
  const estTablee = panierEstUneTablee(cart);
  if (!estTablee && subtotal > UPSELL_SILENCE_THRESHOLD_CHF) {
    return { suggestions: [], debug: { analysis: { totalPrice: subtotal }, context: {}, shortlist: [] } };
  }

  const menu = await fetchFullMenu();

  // Garde d'intégrité des chemins : un id périmé rendrait un chemin
  // silencieusement mort. On journalise plutôt que d'avaler.
  const manquants = idsInconnus(menu);
  if (manquants.articles.length || manquants.categories.length) {
    console.error(
      "[upsell/chemins] références introuvables au catalogue —",
      "articles:", manquants.articles.join(", ") || "aucun",
      "| catégories:", manquants.categories.join(", ") || "aucune",
    );
  }

  // ═══ COUCHE « CHEMINS » (spec Augustin 21.08) ═══════════════════════════
  // Le moteur historique est un SCOREUR. La spec décrit un moteur à CHEMINS
  // prioritaires : le premier qui correspond gagne, jamais de cumul.
  // Les chemins passent DEVANT le scoreur ; quand aucun ne s'applique, le
  // scoreur reprend la main — on ne perd rien de l'existant.
  //
  // ⚠️ Les chemins ne filtrent PAS : leurs candidats repassent obligatoirement
  // par `passesHardFilters`, seul endroit où vivent les gardes dures.
  const resultatChemin = choisitChemin(cart, analysis, menu, context.palierLivraison);
  let cheminRetenu: string | null = resultatChemin?.chemin ?? null;

  // P8 — le silence est une réponse valable.
  if (resultatChemin?.chemin === "P8") {
    return {
      suggestions: [],
      debug: { analysis: { isFullMeal: true }, context: {}, shortlist: [] },
    };
  }

  const parChemin: UpsellCandidate[] = [];
  for (const item of resultatChemin?.candidats ?? []) {
    if (!passesHardFilters(item, analysis, context)) continue;
    // Score nominal : l'ordre vient du chemin, pas du score. On garde un
    // score décroissant pour ne pas casser les tris en aval.
    parChemin.push({
      item,
      score: 1000 - parChemin.length,
      reasons: [`chemin:${resultatChemin!.chemin}`],
    });
  }
  // ⚠️ SI AUCUN CANDIDAT DU CHEMIN NE SURVIT AUX GARDES DURES, LE CHEMIN
  // N'A PAS GAGNÉ — c'est le scoreur qui reprend. Il faut alors oublier le
  // chemin ENTIÈREMENT, y compris son palier.
  // Bug attrapé en production le 21.08 : `economiePalier` lisait encore
  // `resultatChemin` (donc P2) alors que `cheminRetenu` était déjà remis à
  // null. Résultat : une suggestion choisie par le SCOREUR — donc jamais
  // filtrée sur « prix ≥ écart » — s'affichait avec le message de coût net.
  // Le seuil aurait pu ne PAS être franchi, et le prix affiché engage.
  // La condition de véracité ① était contournée par le repli.
  let cheminGagnant = resultatChemin;
  if (parChemin.length === 0) {
    cheminRetenu = null;
    cheminGagnant = null;
  }

  // Filtres durs + scoring
  const scored: UpsellCandidate[] = [];
  for (const item of menu) {
    if (!passesHardFilters(item, analysis, context)) continue;
    const { score, reasons } = scoreItem(item, analysis, context);
    if (score > 0) scored.push({ item, score, reasons });
  }

  // Un chemin a parlé → il PRIME sur le scoreur, sans cumul.
  if (parChemin.length > 0) {
    scored.length = 0;
    scored.push(...parChemin);
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

  // Budget (0/1/2) décidé par decideSuggestionBudget.
  let budget = decideSuggestionBudget(analysis, diverseTop);
  // v2 : max 1 suggestion par commande.
  // (Remplace le cap conditionnel V3 >=6 items / 2+ mains / 2+ boissons, devenu
  //  redondant sous ce plafond global — locals totalMains/totalDrinks retirés.)
  budget = Math.min(budget, 1);
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
      chemin: cheminRetenu,
      palier: economiePalier(cand.item.price, cheminGagnant),
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
        message: genericPairingMessage(analysis),
        category: c.item.dish_role,
        score: c.score,
        reasons: c.reasons,
        chemin: cheminRetenu,
        palier: economiePalier(c.item.price, cheminGagnant),
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
