/**
 * Client minimal Gemini API (Google AI Studio).
 *
 * 2 modèles utilisés dans ce projet :
 *   - gemini-2.0-flash           : génération de texte (descriptions menu)
 *   - gemini-2.5-flash-image     : Nano Banana Pro (images plats)
 *
 * Auth : header x-goog-api-key avec GEMINI_API_KEY (env Vercel).
 */

export type GeminiTextResult =
  | { ok: true; text: string; finish_reason?: string }
  | { ok: false; reason: string; status?: number; detail?: string };

export type GeminiImageResult =
  | {
      ok: true;
      mime_type: string;
      data_base64: string;
      finish_reason?: string;
    }
  | { ok: false; reason: string; status?: number; detail?: string };

/**
 * Cascade texte — ordre optimisé pour le free tier d'Augustin (vérifié
 * via GET /api/admin/gemini-models). Les modèles "lite" ont un quota
 * plus généreux, on les met en premier pour éviter les 429 sur les
 * modèles flagship. gemini-1.5-flash-* n'est plus dispo en v1beta.
 */
const TEXT_MODEL_FALLBACKS = [
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-2.0-flash",
  "gemini-flash-latest",
  "gemini-2.5-flash",
];

/**
 * Génère un texte via Gemini (cascade fallback sur plusieurs modèles).
 * Retourne un résultat structuré pour faciliter le diag.
 */
export async function generateGeminiText(params: {
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  apiKey?: string;
  model?: string;
}): Promise<GeminiTextResult> {
  const apiKey = params.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "missing_api_key" };
  }

  const modelsToTry = params.model ? [params.model] : TEXT_MODEL_FALLBACKS;
  let lastError: GeminiTextResult | null = null;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: params.prompt }] }],
          generationConfig: {
            temperature: params.temperature ?? 0.7,
            maxOutputTokens: params.maxOutputTokens ?? 600,
          },
        }),
      });

      const raw = await res.text();
      if (!res.ok) {
        lastError = {
          ok: false,
          reason: "http_error",
          status: res.status,
          detail: `model=${model} ${raw.slice(0, 400)}`,
        };
        // Cascade sur :
        //   - 400/404 : modèle n'existe pas (nom changé)
        //   - 429 : quota épuisé sur ce modèle (chaque modèle a son
        //           propre quota, gemini-1.5-flash a une limite distincte
        //           de gemini-2.5-flash)
        //   - 503 : high demand temporaire
        if ([400, 404, 429, 503].includes(res.status)) continue;
        return lastError;
      }

      type GeminiResp = {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        promptFeedback?: { blockReason?: string };
      };
      const body = JSON.parse(raw) as GeminiResp;

      if (body.promptFeedback?.blockReason) {
        return {
          ok: false,
          reason: "safety_block",
          detail: body.promptFeedback.blockReason,
        };
      }

      const candidate = body.candidates?.[0];
      const text = candidate?.content?.parts
        ?.map((p) => p.text)
        .filter(Boolean)
        .join("\n");

      if (!text || text.trim().length === 0) {
        return {
          ok: false,
          reason: "empty_response",
          detail: `model=${model} finishReason=${candidate?.finishReason}`,
        };
      }

      return {
        ok: true,
        text: text.trim(),
        finish_reason: candidate?.finishReason,
      };
    } catch (err) {
      lastError = {
        ok: false,
        reason: "exception",
        detail: `model=${model} ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return lastError ?? { ok: false, reason: "no_model_responded" };
}

/**
 * Cascade des modèles image. IMPORTANT : les modèles image Gemini
 * nécessitent BILLING ACTIVÉ sur Google Cloud (pas disponibles en
 * free tier 100%). Si les 5 tentatives retournent 404 → Augustin doit
 * activer le billing sur console.cloud.google.com → API Gemini.
 *
 * Alternative : utiliser Imagen API via Vertex AI (autre endpoint,
 * non implémenté ici).
 */
const IMAGE_MODEL_FALLBACKS = [
  // Vrais noms dispos sur la clé Augustin (vérifiés via
  // /api/admin/gemini-models) :
  "gemini-2.5-flash-image",
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "nano-banana-pro-preview",
];

/**
 * Génère une image via Gemini Nano Banana Pro (cascade fallback).
 */
export async function generateGeminiImage(params: {
  prompt: string;
  apiKey?: string;
  model?: string;
}): Promise<GeminiImageResult> {
  const apiKey = params.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, reason: "missing_api_key" };
  }

  const modelsToTry = params.model
    ? [params.model]
    : IMAGE_MODEL_FALLBACKS;
  let lastError: GeminiImageResult | null = null;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: params.prompt }] }],
          // Les modèles gemini-*-exp-image-generation et
          // gemini-2.0-flash-exp exigent responseModalities pour
          // retourner une image. Pour gemini-2.5-flash-image-preview,
          // le champ est ignoré s'il n'est pas supporté.
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
          },
        }),
      });

      const raw = await res.text();
      if (!res.ok) {
        lastError = {
          ok: false,
          reason: "http_error",
          status: res.status,
          detail: `model=${model} ${raw.slice(0, 400)}`,
        };
        if ([400, 404, 429, 503].includes(res.status)) continue;
        return lastError;
      }

      type GeminiImageResp = {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              inlineData?: { mimeType?: string; data?: string };
              inline_data?: { mime_type?: string; data?: string };
              text?: string;
            }>;
          };
          finishReason?: string;
        }>;
        promptFeedback?: { blockReason?: string };
      };
      const body = JSON.parse(raw) as GeminiImageResp;

      if (body.promptFeedback?.blockReason) {
        return {
          ok: false,
          reason: "safety_block",
          detail: body.promptFeedback.blockReason,
        };
      }

      const candidate = body.candidates?.[0];
      const parts = candidate?.content?.parts ?? [];

      const imagePart = parts.find(
        (p) =>
          (p.inlineData?.data && p.inlineData?.mimeType) ||
          (p.inline_data?.data && p.inline_data?.mime_type),
      );

      const data = imagePart?.inlineData?.data ?? imagePart?.inline_data?.data;
      const mimeType =
        imagePart?.inlineData?.mimeType ??
        imagePart?.inline_data?.mime_type ??
        "image/png";

      if (!data) {
        return {
          ok: false,
          reason: "no_image_in_response",
          detail: `model=${model} finishReason=${candidate?.finishReason}`,
        };
      }

      return {
        ok: true,
        mime_type: mimeType,
        data_base64: data,
        finish_reason: candidate?.finishReason,
      };
    } catch (err) {
      lastError = {
        ok: false,
        reason: "exception",
        detail: `model=${model} ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return lastError ?? { ok: false, reason: "no_model_responded" };
}

/**
 * Nettoie un texte généré par un LLM : retire markdown, guillemets
 * englobants, préfixes/suffixes parasites courants.
 */
export function cleanLLMText(input: string): string {
  if (!input) return "";
  let t = input.trim();

  // Retire les blocs markdown de type ```...```
  t = t.replace(/^```[a-z]*\s*\n?/gim, "").replace(/\n?```\s*$/g, "");

  // Retire les guillemets englobants "..." ou «...»
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("«") && t.endsWith("»"))
  ) {
    t = t.slice(1, -1).trim();
  }

  // Retire les titres markdown #, ##, ###
  t = t.replace(/^#{1,6}\s+[^\n]+\n?/gim, "");

  // Retire les préfixes communs "Description : " / "Voici : "
  t = t.replace(/^(description\s*:|voici\s*:|voici le texte\s*:)\s*/i, "");

  // Collapse les lignes vides multiples
  t = t.replace(/\n{3,}/g, "\n\n").trim();

  return t;
}
