/**
 * Version CŒUR-ONLY découplée de loyalty-cards/src/lib/smsTemplates.ts.
 *
 * Ne porte que ce dont le cœur fidélité a besoin :
 *   - renderTemplate() (remplacement {{var}}, inconnues → '', compression
 *     des espaces doubles, trim) — VERBATIM.
 *   - l'entrée loyalty_card_created de TEMPLATE_META.
 *
 * N'embarque PAS buildContext, ni les 18 autres templates, ni l'import
 * orderFormat.
 */

export const TEMPLATE_META: Record<
  "loyalty_card_created",
  { title: string; description: string; defaultContent: string }
> = {
  loyalty_card_created: {
    title: "Carte fidélité créée",
    description:
      "Envoyé automatiquement après création d'une carte fidélité. {{card_url}} = lien vers la carte avec QR code.",
    defaultContent:
      "Bienvenue chez Rialto {{customer_name}} ! Ta carte fidelite est prete. Montre-la a chaque commande : {{card_url}} - 1 pizza offerte apres 10 tampons !",
  },
};

/**
 * Variables supportées par les templates.
 *   - loyalty_card_created : customer_name, card_url, restaurant_name
 *   - reward_unlocked      : customer_name, reward_label
 */
export type TemplateVariableKey =
  | "customer_name"
  | "card_url"
  | "restaurant_name"
  | "reward_label";

export type TemplateContext = Partial<Record<TemplateVariableKey, string>>;

/**
 * Remplace les {{variables}} dans un template par les valeurs du contexte.
 * Les variables inconnues ou non fournies sont remplacées par une chaîne vide.
 */
export function renderTemplate(
  content: string,
  ctx: TemplateContext,
): string {
  return content
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
      const k = key.toLowerCase() as TemplateVariableKey;
      return (ctx[k] ?? "").trim();
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}
