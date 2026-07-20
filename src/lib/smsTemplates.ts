/**
 * Version CŒUR-ONLY découplée de loyalty-cards/src/lib/smsTemplates.ts.
 *
 * Ne porte que ce dont le cœur fidélité a besoin :
 *   - renderTemplate() (remplacement {{var}}, inconnues → '', compression
 *     des espaces doubles, trim) — VERBATIM.
 *   - les entrées loyalty_card_created (Lot 3), wheel_prize_code (Lot 5) et
 *     referral_success (Lot 7) de TEMPLATE_META.
 *
 * N'embarque PAS buildContext, ni les 18 autres templates, ni l'import
 * orderFormat.
 */

export const TEMPLATE_META: Record<
  "loyalty_card_created" | "wheel_prize_code" | "referral_success" | "referral_claim_reward",
  { title: string; description: string; defaultContent: string }
> = {
  loyalty_card_created: {
    title: "Carte fidélité créée",
    description:
      "Envoyé automatiquement après création d'une carte fidélité. {{card_url}} = lien vers la carte avec QR code.",
    defaultContent:
      "Bienvenue chez Rialto {{customer_name}} ! Ta carte fidelite est prete. Montre-la a chaque commande : {{card_url}} - 1 pizza offerte apres 10 tampons !",
  },
  wheel_prize_code: {
    title: "Code promo gagné (roue)",
    description:
      "Envoyé quand un client gagne un lot à la roue de la chance. {{code}} = code promo, {{reward_label}} = libellé du lot.",
    defaultContent:
      "Bravo {{customer_name}} ! Tu as gagne {{reward_label}} sur ta prochaine commande. Code : {{code}}. Valable 30 jours. Rialto.",
  },
  referral_claim_reward: {
    title: "Bienvenue filleul (parrainage)",
    description:
      "Envoyé au filleul quand sa 1re commande valide le parrainage. Variables : {{customer_name}}, {{code}}.",
    defaultContent:
      "Bienvenue chez Rialto {{customer_name}} ! Votre code de bienvenue : {{code}} — une Pizza Marguerite offerte sur votre prochaine commande, valable 60 jours. rialto-lausanne.ch",
  },
  referral_success: {
    title: "Parrainage réussi",
    description:
      "Envoyé au parrain quand un filleul passe sa 1re commande. Variables : {{customer_name}}, {{reward_label}}, {{code}}.",
    defaultContent:
      "🎉 Merci {{customer_name}} ! Ton filleul a commande chez Rialto. Tu gagnes {{reward_label}}. Code : {{code}} (valable 60 jours).",
  },
};

/**
 * Variables supportées par les templates.
 *   - loyalty_card_created : customer_name, card_url, restaurant_name
 *   - reward_unlocked      : customer_name, reward_label
 *   - wheel_prize_code     : customer_name, reward_label, code, restaurant_name
 */
export type TemplateVariableKey =
  | "customer_name"
  | "card_url"
  | "restaurant_name"
  | "reward_label"
  | "code";

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
