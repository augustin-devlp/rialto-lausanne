/**
 * Cadeaux d'anniversaire (03.08.2026) — honore la promesse de
 * l'ActivationModal : « un cadeau le jour de votre anniversaire ».
 *
 * DÉCLENCHEMENT : greffé sur le cron quotidien loyalty-settle (09:30) —
 * le plan Vercel Hobby n'autorise qu'une exécution quotidienne par cron,
 * un second cron dédié ferait rejeter le déploiement (leçon F3 du 22.07).
 *
 * ÉLIGIBLES : customers avec date_of_birth ET téléphone, porteurs d'une
 * carte Rialto ACTIVÉE (is_fully_activated — c'est l'activation qui
 * recueille la date et le consentement SMS anniversaire, cf.
 * ActivationModal). Anniversaires du jour en Europe/Zurich ; les 29.02
 * sont fêtés le 28.02 les années non bissextiles.
 *
 * CADEAU v1 : code −20 % (source 'birthday', usage unique, 7 jours) + SMS
 * template `birthday_wish`. La branche VIP (`birthday_wish_vip`, dessert
 * sans code) attend que des paliers existent dans vip_tiers — table VIDE
 * aujourd'hui, personne ne peut être VIP, on ne code pas un chemin mort.
 *
 * IDEMPOTENCE : un code source='birthday' par client et par fenêtre de
 * 300 jours (promo_codes fait office de journal — pas de table dédiée,
 * pas de DDL). Le cron ne tourne qu'une fois par jour ; la garde couvre
 * les relances manuelles.
 */

import { RESTAURANT_ID, supabaseService } from "@/lib/supabase";
import { CARD_ID } from "@/lib/loyaltyConstants";
import { generatePromoCode } from "@/lib/promoCodes";
import { renderTemplate } from "@/lib/smsTemplates";
import { sendSms } from "@/lib/brevo";
import { toZurichDate } from "@/lib/timezone";

/**
 * ⚠️ COUPLAGE : le template SMS `birthday_wish` (table sms_templates,
 * éditable au dashboard) répète cette durée en toutes lettres
 * (« valable 7 jours »). Changer ce chiffre sans corriger le template
 * enverrait une durée fausse — le défaut trouvé sur referral_success.
 */
export const BIRTHDAY_PROMO_VALID_DAYS = 7;
const BIRTHDAY_DISCOUNT_PERCENT = 20;
/** Garde anti re-fête : à 300 j, tolère les anniversaires « décalés ». */
const REGREET_GUARD_DAYS = 300;

/** Contenu de secours si le template a disparu de la base (vouvoyé). */
const FALLBACK_CONTENT =
  "🎂 Joyeux anniversaire {{customer_name}} ! Chez Rialto, on pense à vous : -20% sur votre prochaine commande avec le code {{code}} (valable 7 jours). À bientôt 🍕";

type Bilan = {
  eligibles: number;
  deja_servis: number;
  codes_generes: number;
  sms_envoyes: number;
  erreurs: number;
};

function estBissextile(annee: number): boolean {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

export async function envoieCadeauxAnniversaire(
  sb: ReturnType<typeof supabaseService>,
): Promise<Bilan> {
  const bilan: Bilan = {
    eligibles: 0,
    deja_servis: 0,
    codes_generes: 0,
    sms_envoyes: 0,
    erreurs: 0,
  };

  // Aujourd'hui en Suisse, au format MM-DD.
  const aujourdHui = toZurichDate(new Date()); // "YYYY-MM-DD"
  const annee = Number(aujourdHui.slice(0, 4));
  const mmdd = aujourdHui.slice(5);
  const mmddAcceptes =
    mmdd === "02-28" && !estBissextile(annee) ? [mmdd, "02-29"] : [mmdd];

  const { data: clients, error } = await sb
    .from("customers")
    .select(
      "id, first_name, phone, date_of_birth, customer_cards!inner(card_id, is_fully_activated)",
    )
    .eq("customer_cards.card_id", CARD_ID)
    .eq("customer_cards.is_fully_activated", true)
    .not("date_of_birth", "is", null)
    .not("phone", "is", null);

  if (error) {
    console.error("[birthday] lecture clients échouée", error);
    bilan.erreurs++;
    return bilan;
  }

  const fetes = ((clients ?? []) as Array<{
    id: string;
    first_name: string | null;
    phone: string | null;
    date_of_birth: string;
  }>).filter((c) => mmddAcceptes.includes(String(c.date_of_birth).slice(5)));

  bilan.eligibles = fetes.length;
  if (fetes.length === 0) return bilan;

  // Template chargé UNE fois pour toute la fournée.
  const { data: tmpl } = await sb
    .from("sms_templates")
    .select("content, enabled")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("template_key", "birthday_wish")
    .maybeSingle();
  const effective = tmpl ?? { content: FALLBACK_CONTENT, enabled: true };

  const garde = new Date(
    Date.now() - REGREET_GUARD_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  for (const client of fetes) {
    try {
      // Idempotence : déjà fêté dans la fenêtre de garde ?
      const { data: dejaServi } = await sb
        .from("promo_codes")
        .select("id")
        .eq("customer_id", client.id)
        .eq("source", "birthday")
        .gte("created_at", garde)
        .limit(1)
        .maybeSingle();
      if (dejaServi) {
        bilan.deja_servis++;
        continue;
      }

      const gen = await generatePromoCode({
        business_id: "", // ignoré : la constante serveur fait foi
        restaurant_id: RESTAURANT_ID,
        customer_id: client.id,
        phone: client.phone,
        source: "birthday",
        discount_type: "percent",
        discount_value: BIRTHDAY_DISCOUNT_PERCENT,
        min_order_amount: 0,
        max_uses: 1,
        valid_days: BIRTHDAY_PROMO_VALID_DAYS,
      });
      if (!gen.ok) {
        console.error("[birthday] génération code échouée", client.id, gen.error);
        bilan.erreurs++;
        continue;
      }
      bilan.codes_generes++;

      if (!effective.enabled) {
        console.log("[birthday] template birthday_wish désactivé — pas de SMS");
        continue;
      }
      const contenu = renderTemplate(effective.content, {
        customer_name: client.first_name ?? "",
        code: gen.code.code,
        restaurant_name: "Rialto",
      });
      try {
        await sendSms(client.phone as string, contenu, "Rialto");
      } catch {
        // Cascade sender (pattern roue) : certains réseaux refusent
        // l'expéditeur alphanumérique « Rialto ».
        await sendSms(client.phone as string, contenu);
      }
      bilan.sms_envoyes++;
      console.log("[birthday] cadeau envoyé", {
        customer_id: client.id,
        code: gen.code.code,
      });
    } catch (err) {
      console.error("[birthday] échec pour", client.id, err);
      bilan.erreurs++;
    }
  }

  return bilan;
}
