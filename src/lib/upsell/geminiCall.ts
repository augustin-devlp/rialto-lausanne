import { generateGeminiText, cleanLLMText } from '@/lib/gemini';
import type { UpsellCandidate, UpsellContext, CartAnalysis } from './types';
import { buildGeminiPrompt } from './geminiPrompt';

export interface GeminiUpsellMessage {
  menu_item_id: string;
  message: string;
}

/**
 * Appel Gemini pour générer les messages d'upsell.
 * En cas d'échec / timeout / API key manquante, retourne fallback messages
 * basiques construits côté code (ne jette jamais).
 */
export async function callGeminiForMessages(
  topCandidates: UpsellCandidate[],
  analysis: CartAnalysis,
  context: UpsellContext,
  maxSuggestions: number,
): Promise<GeminiUpsellMessage[]> {
  if (topCandidates.length === 0 || maxSuggestions === 0) return [];

  const prompt = buildGeminiPrompt({ analysis, context, topCandidates, maxSuggestions });
  const start = Date.now();

  // Phase 12 V3 — timeout 2000ms via Promise.race pour viser une médiane <3s.
  // (3500ms initialement : médiane prod = 4.4s. Réduction à 2000ms.)
  const TIMEOUT_MS = 2000;
  let res: Awaited<ReturnType<typeof generateGeminiText>>;
  try {
    res = await Promise.race([
      generateGeminiText({ prompt, temperature: 0.6, maxOutputTokens: 300 }),
      new Promise<Awaited<ReturnType<typeof generateGeminiText>>>((_, rej) =>
        setTimeout(() => rej(new Error('gemini_timeout')), TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[upsell/gemini] timeout/error → fallback', { latency: Date.now() - start, error: msg });
    return fallbackMessages(topCandidates, maxSuggestions);
  }
  const latency = Date.now() - start;

  if (!res.ok) {
    console.warn('[upsell/gemini] fail, fallback messages', {
      reason: res.reason,
      latency,
    });
    return fallbackMessages(topCandidates, maxSuggestions);
  }

  try {
    const clean = cleanLLMText(res.text);
    const match = clean.match(/\[[\s\S]*\]/);
    const jsonStr = match ? match[0] : clean;
    const parsed = JSON.parse(jsonStr) as Array<{ id?: string; menu_item_id?: string; message?: string }>;

    const candidateIds = new Set(topCandidates.map((c) => c.item.id));
    const out: GeminiUpsellMessage[] = [];
    for (const row of parsed.slice(0, maxSuggestions)) {
      const id = row.id || row.menu_item_id;
      if (!id || !candidateIds.has(id) || !row.message) continue;
      const trimmed = String(row.message).slice(0, 90).trim();
      if (trimmed) out.push({ menu_item_id: id, message: trimmed });
    }
    console.log('[upsell/gemini] ok', { latency, returned: out.length });
    return out;
  } catch (err) {
    console.warn('[upsell/gemini] parse fail, fallback', err);
    return fallbackMessages(topCandidates, maxSuggestions);
  }
}

/**
 * Fallback en dur (Gemini indisponible / clé absente). Même voix « serveur
 * sympa de la pizzeria de quartier » que le prompt (D4) : phrases courtes,
 * chaleureuses, max 1 emoji, zéro jargon marketing. Textes exacts actés (D4).
 * NB : plus de branche drink_alcohol — code mort (l'alcool ne passe jamais les
 * filtres durs), retirée. Plus besoin de `analysis` non plus.
 */
function fallbackMessages(
  topCandidates: UpsellCandidate[],
  max: number,
): GeminiUpsellMessage[] {
  return topCandidates.slice(0, max).map((c) => {
    const it = c.item;
    let msg: string;
    if (it.dish_role === 'dessert') {
      msg = 'Et un petit dessert pour finir ? 🍰';
    } else if (it.dish_role === 'drink_soft') {
      msg = 'Une boisson fraîche avec ça ?';
    } else if (it.dish_role === 'starter') {
      msg = 'Une entrée pour patienter ?';
    } else if (it.dish_role === 'side' || it.is_shareable) {
      msg = 'Un petit plus à partager ?';
    } else {
      msg = 'Ça va bien avec ta commande.';
    }
    return { menu_item_id: it.id, message: msg };
  });
}
