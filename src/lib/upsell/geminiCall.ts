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
    return fallbackMessages(topCandidates, maxSuggestions, analysis);
  }
  const latency = Date.now() - start;

  if (!res.ok) {
    console.warn('[upsell/gemini] fail, fallback messages', {
      reason: res.reason,
      latency,
    });
    return fallbackMessages(topCandidates, maxSuggestions, analysis);
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
    return fallbackMessages(topCandidates, maxSuggestions, analysis);
  }
}

function fallbackMessages(
  topCandidates: UpsellCandidate[],
  max: number,
  analysis: CartAnalysis,
): GeminiUpsellMessage[] {
  return topCandidates.slice(0, max).map((c) => {
    const it = c.item;
    let msg: string;
    if (analysis.hasSpicyItem && (it.upsell_tags || []).some((t) => t.includes('refresh') || t === 'lemonade' || t === 'iced_tea')) {
      msg = `Parfait pour calmer le piquant.`;
    } else if (it.dish_role === 'dessert') {
      msg = `Un dessert pour finir en beauté ?`;
    } else if (it.dish_role === 'drink_alcohol') {
      msg = `Se marie très bien avec ta commande.`;
    } else if (it.dish_role === 'drink_soft') {
      msg = `Une boisson pour accompagner ?`;
    } else if (it.dish_role === 'starter') {
      msg = `Une entrée légère pour commencer.`;
    } else if ((it.semantic_tags || []).some((t) => t.includes('signature'))) {
      msg = `Notre signature maison, à tester.`;
    } else {
      msg = `Parfait avec ta commande.`;
    }
    return { menu_item_id: it.id, message: msg };
  });
}
