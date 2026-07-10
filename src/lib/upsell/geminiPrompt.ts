import type { CartAnalysis, UpsellCandidate, UpsellContext } from './types';

/**
 * Construit le prompt Gemini pour générer les messages de suggestion.
 * Ne change PAS l'ordre des candidats (le ranking vient du scoring),
 * Gemini décide juste du copywriting par suggestion et peut en
 * éliminer si vraiment non pertinent (en retournant moins d'éléments).
 */
export function buildGeminiPrompt(params: {
  analysis: CartAnalysis;
  context: UpsellContext;
  topCandidates: UpsellCandidate[];
  maxSuggestions: number;
}): string {
  const { analysis, context, topCandidates, maxSuggestions } = params;

  const cartList = analysis.itemNames.join(' + ') || '(vide)';
  const candidateBlock = topCandidates
    .slice(0, 5)
    .map(
      (c, i) =>
        `${i + 1}. ${c.item.name} (${c.item.price.toFixed(2)} CHF, ${c.item.dish_role}, ${c.item.cuisine_style}) — tags: ${c.item.upsell_tags.slice(0, 5).join(', ')} — reasons: ${c.reasons.slice(0, 3).join(', ')}`,
    )
    .join('\n');

  const firstName = context.customerName ?? 'client';
  const isVip = context.vipTier === 'gold' || context.vipTier === 'silver';
  const timeOfDayFr = {
    lunch: 'midi',
    afternoon: 'après-midi',
    dinner: 'soir',
    late_night: 'nuit',
  }[context.timeOfDay];

  return `Tu es un serveur chaleureux et précis chez Rialto, pizzeria italo-anatolienne à Lausanne (Avenue de Béthusy 29). Tu dois écrire 0 à ${maxSuggestions} suggestions d'upsell pour un client qui est en train de finaliser sa commande.

CONTEXTE :
- Panier actuel : ${cartList}
- Moment : ${timeOfDayFr}${context.isWeekend ? ' (week-end)' : ' (semaine)'}, saison ${context.season}
- Client : ${firstName}${context.customerName ? '' : ' (inconnu)'}${isVip ? ' — membre VIP ' + context.vipTier : ''}${context.isBirthdayWeek ? ' — anniversaire cette semaine 🎂' : ''}
- Piquant dans le panier : ${analysis.hasSpicyItem ? 'oui (cherche rafraîchissant)' : 'non'}
- Repas lourd : ${analysis.isHeavyMeal ? 'oui' : 'non'}
- Cuisine dominante : ${analysis.dominantCuisine}

CANDIDATS PRÉ-CLASSÉS (déjà filtrés pour la cohérence) :
${candidateBlock}

RÈGLES DE COPYWRITING :
- 1 phrase max par suggestion, 60 caractères max.
- Tu tutoies. Chaleureux, jamais forcé, jamais culpabilisant.
- Si VIP ou anniv : glisse-le discrètement.
- Si le panier est piquant et que tu proposes une boisson fraîche, mentionne-le.
- Si c'est un plat signature, valorise-le ("signature maison", "notre fierté").
- Si Anatolien → miroir culturel ("avec la tajine, c'est parfait").
- Si repas lourd + dessert → léger/rafraîchissant.

SORTIE :
Réponds UNIQUEMENT en JSON strict, aucune prose avant/après, aucun \`\`\`.
Format : [{ "id": "uuid-exact-du-candidat", "message": "phrase courte" }]
- Tu peux renvoyer 0, 1 ou ${maxSuggestions} suggestions (pas plus).
- Si aucun candidat n'est vraiment pertinent, renvoie [].
- Ne modifie JAMAIS les id. Utilise UNIQUEMENT les id de la liste candidats.`;
}
