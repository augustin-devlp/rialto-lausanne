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
/**
 * Translittération GSM-7 des VALEURS substituées (décision Augustin
 * 19.08) : UN SEUL caractère hors alphabet GSM-7 (le « î » de Benoît, le
 * « ê » de Noémie…) bascule TOUT le SMS en UCS-2 — 70 caractères par
 * segment au lieu de 160, soit 2-3 segments FACTURÉS au lieu d'un, sur
 * chaque envoi, pour des milliers de clients. Cette passe couvre les
 * valeurs DYNAMIQUES (prénoms, libellés de lots). Uniformément ASCII
 * (é→e aussi, bien que é soit GSM-7 : la simplicité vaut mieux qu'une
 * table d'exceptions). Les URLs (déjà ASCII) ressortent inchangées.
 *
 * ⚠️ CORRECTION DU 21.08 : cet en-tête affirmait que « les templates maison
 * sont déjà écrits désaccentués ». C'est vrai pour les ACCENTS, faux pour
 * le COÛT — `referral_success` porte un 🎉 en dur, et `birthday_wish` en
 * base porte 🎂 et 🍕. Le corps du template ne passe ni par cette fonction
 * ni par son journal. `signaleContenuHorsGsm7` comble la moitié qu'on peut
 * combler sans toucher à un texte éditorial : elle le SIGNALE.
 */
/**
 * ⚠️ LES LETTRES QUE LA DÉCOMPOSITION UNICODE NE PEUT PAS ATTEINDRE.
 *
 * `normalize("NFD")` sépare une lettre de son ACCENT, puis on retire
 * l'accent. Ça marche pour `é`, `ç`, `ğ`, `ş`, `ë`, `ã`… mais pas pour les
 * lettres BARRÉES ni pour les lettres à part entière : `ı` n'est pas un
 * « i avec un signe », `đ` n'est pas un « d avec un signe ». Elles n'ont
 * aucune décomposition — il n'y a rien à retirer, donc l'ancienne fonction
 * les laissait passer, et un seul de ces caractères bascule TOUT le SMS en
 * UCS-2 (70 caractères par segment au lieu de 160).
 *
 * Audit du 21.08.2026 sur Latin-1 Sup + Latin Extended-A + Extended-B,
 * restreint aux alphabets plausibles dans la clientèle de Rialto :
 *   · turc         `ı`     — le caractère turc le PLUS fréquent (Işık, Çağrı)
 *   · serbo-croate `đ` `Đ` — Đorđe, Đukić (bosniaque et croate aussi)
 *   · polonais     `ł` `Ł` — Łukasz
 *   · maltais, islandais, same — marginaux ici, couverts gratuitement
 * L'ALBANAIS EST PROPRE (`ë` et `ç` se décomposent), le portugais aussi.
 */
const LETTRES_SANS_DECOMPOSITION: Record<string, string> = {
  ı: "i", İ: "I", // turc
  đ: "d", Đ: "D", // serbo-croate / bosniaque
  ł: "l", Ł: "L", // polonais
  ħ: "h", Ħ: "H", // maltais
  ð: "d", Ð: "D", // islandais
  þ: "th", Þ: "Th", // islandais
  ŧ: "t", Ŧ: "T", // same
  ø: "o", Ø: "O", // danois/norvégien (GSM-7 les accepte, mais on uniformise)
};

/**
 * Alphabet GSM-7 (norme 03.38). LISTE POSITIVE volontaire : une garde par
 * EXCLUSION serait insuffisante — le balayage a trouvé 141 caractères latins
 * qui cassent, on ne peut pas tous les énumérer à la main. On répare ce
 * qu'on sait réparer, et on SIGNALE le reste au lieu de le découvrir sur
 * une facture.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà" +
  "^{}\\[~]|€";

function translittereGsm7(valeur: string): string {
  let out = "";
  for (const c of valeur) out += LETTRES_SANS_DECOMPOSITION[c] ?? c;

  out = out
    .normalize("NFD")
    // Forme ÉCHAPPÉE obligatoire : écrit avec les combinants littéraux, ce
    // motif est illisible et se fait détruire par le moindre outil qui
    // renormalise le fichier. Piège déjà rencontré deux fois sur ce repo.
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "Oe")
    .replace(/æ/g, "ae")
    .replace(/Æ/g, "Ae");

  // Filet : ce qui sort encore de GSM-7 est laissé INTACT (mieux vaut un
  // prénom juste qu'un prénom mutilé), mais journalisé — sinon le surcoût
  // n'apparaît que sur la facture, sans aucune trace de sa cause.
  const rebelles = [...out].filter((c) => !GSM7.includes(c));
  if (rebelles.length > 0) {
    console.warn(
      "[sms] caractère(s) hors GSM-7 non translittéré(s) — ce SMS partira en " +
        "UCS-2 (70 caractères/segment au lieu de 160) :",
      rebelles.map((c) => `${c} (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`).join(", "),
    );
  }

  return out;
}

/**
 * Signale les caractères hors GSM-7 présents dans le CORPS d'un template.
 *
 * ⚠️ `translittereGsm7` ne s'applique qu'aux VALEURS substituées. Le corps
 * du template, lui, ne passait ni par le filtre ni par le journal — et il
 * en contient : `referral_success` porte un 🎉 en dur. Le module se donnait
 * donc du mal pour rattraper le « ı » d'Işık et laissait passer un emoji
 * cinquante lignes plus haut, qui double le coût du même SMS.
 * On ne MODIFIE pas le texte (c'est un choix éditorial, et la version en
 * base fait foi) — on le SIGNALE, pour que le surcoût ne se découvre plus
 * sur une facture.
 */
function signaleContenuHorsGsm7(content: string): void {
  const rebelles = [...new Set([...content].filter((c) => !GSM7.includes(c)))];
  if (rebelles.length > 0) {
    console.warn(
      "[sms] le TEXTE du template contient " +
        rebelles.length +
        " caractère(s) hors GSM-7 — ce SMS partira en UCS-2 (70 au lieu de " +
        "160 par segment), quels que soient les prénoms : " +
        rebelles
          .map(
            (c) =>
              c + " (U+" + c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0") + ")",
          )
          .join(", "),
    );
  }
}

export function renderTemplate(
  content: string,
  ctx: TemplateContext,
): string {
  signaleContenuHorsGsm7(content);
  return content
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
      const k = key.toLowerCase() as TemplateVariableKey;
      return translittereGsm7((ctx[k] ?? "").trim());
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}
