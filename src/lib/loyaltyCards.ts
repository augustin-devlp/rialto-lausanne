import { supabaseService } from "./supabase";

/**
 * Forme publique d'une carte fidélité — miroir EXACT de la réponse
 * `{ card }` de l'endpoint Stampify /api/loyalty-cards/lookup.
 * Consommée par la page /c/[shortCode] et l'endpoint local du même nom.
 */
export type PublicCard = {
  id: string;
  short_code: string;
  current_stamps: number;
  stamps_required: number;
  reward_description: string;
  card_name: string;
  qr_code_value: string;
  first_name: string;
  phone_masked: string;
  is_fully_activated: boolean;
  has_birthday: boolean;
  customer_id: string | null;
  vip_tier: "bronze" | "silver" | "gold" | null;
  vip_lifetime_spend: number;
  vip_order_count: number;
};

/**
 * Masque un numéro pour l'affichage sans exposer le numéro complet.
 * Porté VERBATIM depuis loyalty-cards/src/app/api/loyalty-cards/lookup.
 * Ex: "+41791234567" → "+417 XX XX 67". Retourne "" si < 8 chiffres.
 */
function maskPhone(phone: string): string {
  if (phone.length < 6) return "";
  // +41791234567 -> +41 79 XX XX 67
  const clean = phone.replace(/[^\d+]/g, "");
  if (clean.length < 8) return "";
  return `${clean.slice(0, -8)} XX XX ${clean.slice(-2)}`;
}

/**
 * Récupère les infos publiques d'une carte fidélité à partir de son
 * short_code, en lecture DB directe (service role). Reproduit la logique
 * du GET Stampify /api/loyalty-cards/lookup.
 *
 * ⚠️ L'appelant est responsable du trim + toUpperCase + validation de la
 * longueur du short_code (comme la route source). On matche ici en
 * égalité stricte sur `short_code`.
 *
 * Retourne null si aucune carte ne correspond.
 */
export async function lookupCardByShortCode(
  shortCode: string,
): Promise<PublicCard | null> {
  const admin = supabaseService();
  const { data } = await admin
    .from("customer_cards")
    .select(
      `
      id,
      current_stamps,
      rewards_claimed,
      qr_code_value,
      short_code,
      is_fully_activated,
      customer:customer_id (first_name, phone, date_of_birth, gender, vip_tier, vip_lifetime_spend, vip_order_count),
      card:card_id (card_name, reward_description, stamps_required, business_id)
      `,
    )
    .eq("short_code", shortCode)
    .maybeSingle();

  if (!data) return null;

  const customer = Array.isArray(data.customer) ? data.customer[0] : data.customer;
  const card = Array.isArray(data.card) ? data.card[0] : data.card;
  const customerRow = customer as unknown as {
    id?: string;
    first_name?: string;
    phone?: string;
    date_of_birth?: string | null;
    gender?: string | null;
    vip_tier?: "bronze" | "silver" | "gold" | null;
    vip_lifetime_spend?: number | string | null;
    vip_order_count?: number | null;
  } | null;

  return {
    id: data.id,
    short_code: data.short_code,
    current_stamps: Number(data.current_stamps ?? 0),
    stamps_required: Number(card?.stamps_required ?? 10),
    reward_description: (card?.reward_description as string) ?? "Une récompense",
    card_name: (card?.card_name as string) ?? "Carte fidélité",
    qr_code_value: data.qr_code_value,
    first_name: (customer?.first_name as string) ?? "",
    // phone masked pour affichage sans exposer le numéro complet
    phone_masked: maskPhone((customer?.phone as string) ?? ""),
    // flag activation 2e étape (date anniversaire)
    is_fully_activated: Boolean(
      (data as unknown as { is_fully_activated?: boolean }).is_fully_activated,
    ),
    has_birthday: Boolean(customerRow?.date_of_birth),
    // ⚠️ BUG PRÉSERVÉ (décision D5) : le nested select customer n'inclut
    // PAS 'id', donc customer_id vaut toujours null. NE PAS corriger ici
    // (correction prévue au lot push).
    customer_id: customerRow?.id ?? null,
    vip_tier: customerRow?.vip_tier ?? null,
    vip_lifetime_spend: customerRow?.vip_lifetime_spend
      ? Number(customerRow.vip_lifetime_spend)
      : 0,
    vip_order_count: customerRow?.vip_order_count ?? 0,
  };
}
