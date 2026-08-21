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

import { auDessus } from "@/lib/money";
export const UPSELL_SILENCE_THRESHOLD_CHF = 80;
/** Plafond de la TABLÉE (≥ 3 plats). Au-delà, on se tait aussi : quelqu'un
 *  qui commande pour dix personnes n'a pas besoin d'une boisson de plus. */
export const UPSELL_SILENCE_TABLEE_CHF = 150; // silence total au-dessus (configurable) — au-delà, suggérer paraît cupide

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

  // ⚠️ « UN PANIER SOUS LE MINIMUM N'EST JAMAIS FAIT TAIRE » — la phrase
  // était écrite 40 lignes plus bas, APRÈS trois sorties qui le faisaient
  // taire quand même (relecture adversariale 21.08). Elle vit maintenant
  // ICI, au-dessus de tout ce qui peut rendre le silence.
  // Raison : un panier sous le minimum est REFUSÉ au checkout. Se taire
  // laisse le client devant un bouton qui ne marche pas, sans lui dire
  // pourquoi. C'est la seule situation où le moteur DOIT parler.
  // Les trois sorties concernées : repas complet (ci-dessous), panier de
  // 8 articles et plus, et le plafond de silence.
  const bloque = Boolean(
    context.ecartMinimum && context.ecartMinimum.remaining > 0,
  );

  // Phase 12 V3 — F1 : repas complet → 0 suggestion (BUG #2)
  // ⚠️ Scénario réel qui a motivé la garde `!bloque` : entrée 6.00 + petite
  // pizza 14.00 + Coca 3.50 + baklava 6.00 = 29.50, dans une zone à 45 de
  // minimum. Le panier est « complet » ET refusé. Sans la garde, le tiroir
  // ne disait rien et le client restait bloqué à 15.50 près.
  if (!bloque && analysis.isFullMeal) {
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
  // `!bloque` : 8 petits articles peuvent rester sous un minimum à 55.
  if (!bloque && analysis.totalItems >= 8) {
    return { suggestions: [], debug: { analysis: { totalItems: analysis.totalItems }, context: {}, shortlist: [] } };
  }

  // v2 (D2) — garde-fou anti-lourdeur : sous-total > seuil CHF → silence total.
  // Au-delà, suggérer paraît cupide. S'ajoute au court-circuit >=8 items ci-dessus.
  // ⚠️ `sousTotalReel` D'ABORD, `analysis.totalPrice` seulement en repli.
  // `totalPrice` ne compte que `price × qty` — il IGNORE les suppléments
  // d'options, alors que le checkout et la facturation les comptent. Un
  // panier à 78.00 de base + 8.00 d'extras s'affiche 86.00 au client et
  // valait 78 ici : sous le plafond de 80, donc le moteur suggérait quand
  // même sur une commande que le seuil devait faire taire. C'est le même
  // bug que celui corrigé sur P2 et P7 il y a une heure, resté un niveau
  // au-dessus. Repli sur `totalPrice` quand la route n'a pas fourni le
  // montant (appel hors route, tests).
  const subtotal = context.sousTotalReel ?? analysis.totalPrice;

  // ⚠️ LE MODE TABLÉE IGNORE CE SEUIL (décision Augustin 21.08).
  //
  // Le plafond de 80 CHF a été pensé pour une GROSSE COMMANDE
  // INDIVIDUELLE — au-delà, insister paraît cupide. Il ne vaut pas pour un
  // GROUPE : trois plats, c'est précisément là que le 1.5 l et les formats
  // 11 pièces paient. Constaté en production le 21.08 : trois plats à 29
  // font déjà 87, donc le mode le plus rentable du moteur était muet
  // exactement sur les tablées les plus chères.
  // ⚠️ LA DÉROGATION TABLÉE A UN PLAFOND (Augustin 21.08). Elle était
  // BINAIRE : `!estTablee && subtotal > 80` ouvrait la vanne jusqu'au
  // plafond suivant (8 articles), donc 7 plats à 29 = 203 CHF recevaient
  // une suggestion. Proposer une glace à une tablée de 200 CHF, c'est
  // exactement le « ça paraît cupide » que le seuil devait empêcher.
  // La justification écrite portait sur un cas à ~90 CHF : on borne là.
  const estTablee = panierEstUneTablee(cart);
  const plafondSilence = estTablee
    ? UPSELL_SILENCE_TABLEE_CHF
    : UPSELL_SILENCE_THRESHOLD_CHF;
  // `bloque` est calculé en tête de fonction, au-dessus de TOUTES les
  // sorties silencieuses — c'est le sens de la garde.
  // Comparaison en centimes (`src/lib/money.ts`) : un panier à 80.00 pile
  // ne doit pas basculer d'un côté ou de l'autre selon un résidu binaire.
  if (!bloque && auDessus(subtotal, plafondSilence)) {
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
  const resultatChemin = choisitChemin(
    cart,
    analysis,
    menu,
    context.palierLivraison,
    context.ecartMinimum,
  );
  let cheminRetenu: string | null = resultatChemin?.chemin ?? null;

  // P7 sans candidat viable : le panier est SOUS LE MINIMUM et aucun
  // article seul ne le débloque. On sort ici en disant le montant — sinon
  // le scoreur reprendrait la main et proposerait n'importe quoi à
  // quelqu'un qui ne peut pas commander.
  if (resultatChemin?.chemin === "P7" && resultatChemin.manqueSeul) {
    return {
      suggestions: [],
      blocage: { manque: resultatChemin.manqueSeul },
      debug: { analysis: {}, context: {}, shortlist: [] },
    };
  }

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

  // 🔴 LA GARDE DU PANIER BLOQUÉ VIT ICI, APRÈS LES FILTRES DURS — PAS
  // AVANT (relecture adversariale 21.08).
  // Le court-circuit posé plus haut (celui qui teste `manqueSeul`) ne voit
  // que le cas où P7
  // n'a trouvé AUCUN candidat. Il rate celui où P7 en a trouvé un à quatre
  // et où `passesHardFilters` les tue TOUS : `parChemin` est alors vide,
  // le chemin est oublié juste au-dessus, et le SCOREUR reprend la main
  // sur un panier qui ne peut pas commander.
  // Aggravant : `cheminP7` trie par prix croissant et garde les 4 premiers
  // — quatre candidats dans une bande de prix étroite, donc CORRÉLÉS. Un
  // seul filtre dur les emporte d'un coup. Exemples réels : les quatre
  // moins chers ≥ l'écart sont des bouteilles 1.5 l et le panier a déjà
  // une boisson ; ou le panier est 100 % végétarien et les quatre sont
  // carnés.
  // Ce que ça donnait : le client ajoutait le dessert proposé par le
  // scoreur, restait sous le minimum, se faisait refuser au checkout — et
  // le panneau s'était fermé pour toute la session. Il n'a jamais su de
  // combien il manquait.
  // C'est la variante fine de la règle gravée : la garde ne vit pas là où
  // le chemin est CHOISI, elle vit là où il est FILTRÉ.
  if (bloque && parChemin.length === 0 && context.ecartMinimum) {
    return {
      suggestions: [],
      blocage: { manque: context.ecartMinimum.remaining },
      debug: { analysis: {}, context: {}, shortlist: [] },
    };
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
