/**
 * ⚠️ AVANT de brancher/modifier un SMS : lire docs/SMS_TEMPLATES.md —
 * la table de référence des 18 templates (statut, appelant, interdits).
 * 10 sur 18 sont orphelins (birthday_wish ACTIF depuis le 03.08.2026 via
 * src/lib/birthday.ts ; lottery_winner BRANCHÉ le 19.08.2026 via le
 * tirage mensuel) et order_cancelled est INTERDIT (19.07.2026).
 *
 * Version CŒUR-ONLY découplée de loyalty-cards/src/lib/smsTemplates.ts.
 *
 * Ne porte que ce dont le cœur fidélité a besoin :
 *   - renderTemplate() (remplacement {{var}}, inconnues → '', compression
 *     des espaces doubles, trim) — VERBATIM.
 *   - les 5 entrées de TEMPLATE_META : loyalty_card_created (Lot 3),
 *     wheel_prize_code (Lot 5), lottery_winner (lot G 19.08),
 *     referral_success (Lot 7), referral_claim_reward (cron parrainage).
 *
 * N'embarque PAS buildContext, ni les 18 autres templates, ni l'import
 * orderFormat.
 */

export const TEMPLATE_META: Record<
  | "loyalty_card_created"
  | "wheel_prize_code"
  | "lottery_winner"
  | "referral_success"
  | "referral_claim_reward",
  { title: string; description: string; defaultContent: string }
> = {
  loyalty_card_created: {
    title: "Carte fidélité créée",
    description:
      "Envoyé automatiquement après création d'une carte fidélité. {{card_url}} = lien vers la carte avec QR code.",
    defaultContent:
      "Bienvenue chez Rialto {{customer_name}} ! Votre carte fidelite est prete. Montrez-la a chaque commande : {{card_url}}",
  },
  wheel_prize_code: {
    title: "Code promo gagné (roue)",
    description:
      "Envoyé quand un client gagne un lot à la roue de la chance. {{code}} = code promo, {{reward_label}} = libellé du lot.",
    defaultContent:
      "Bravo {{customer_name}} ! Vous avez gagne {{reward_label}} sur votre prochaine commande. Code : {{code}}. Valable 30 jours. Rialto.",
  },
  lottery_winner: {
    title: "Gagnant de la loterie mensuelle",
    description:
      "Envoyé au gagnant du tirage mensuel (unification roue 19.08 : le gain est un code promo checkout). Variables : {{customer_name}}, {{reward_label}}, {{code}}.",
    // ⚠️ « 30 jours » DOIT rester aligné sur lottery/draw/route.ts
    // (valid_days: 30). La version EN BASE fait foi (seedée, vouvoyée
    // 19.08 — l'ancien seed tutoyait, contraire à la règle de marque).
    defaultContent:
      "Felicitations {{customer_name}} ! Vous avez gagne {{reward_label}} a la loterie Rialto. Code : {{code}}. A utiliser sur votre prochaine commande en ligne (30 jours).",
  },
  referral_claim_reward: {
    title: "Bienvenue filleul (parrainage)",
    description:
      "Envoyé au filleul quand sa 1re commande valide le parrainage. Variables : {{customer_name}}, {{code}}.",
    // ⚠️ SANS URL : « rialto-lausanne.ch » (fallback historique) est un
    // domaine DÉTENU PAR JUST EAT (cf. docs/BASCULE_DOMAINE.md) — chaque
    // SMS filleul envoyait le client chez la plateforme. L'URL du domaine
    // final sera ajoutée au template EN BASE à la bascule (jour J).
    // Tiret simple, pas de cadratin : hors GSM-7 = SMS facturé ×3.
    defaultContent:
      "Bienvenue chez Rialto {{customer_name}} ! Votre code de bienvenue : {{code}} - une Pizza Marguerite offerte sur votre prochaine commande, valable 60 jours.",
  },
  referral_success: {
    title: "Parrainage réussi",
    description:
      "Envoyé au parrain quand un filleul passe sa 1re commande. Variables : {{customer_name}}, {{reward_label}}, {{code}}.",
    // ⚠️ « 60 jours » DOIT rester aligné sur reward-referrals/route.ts
    // (validUntil.setDate(+60)). La version EN BASE fait foi : elle annonçait
    // 30 jours pour des codes de 60, corrigée le 22.07.
    defaultContent:
      "🎉 Merci {{customer_name}} ! Votre filleul a commande chez Rialto. Vous gagnez {{reward_label}}. Code : {{code}} (valable 60 jours).",
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
