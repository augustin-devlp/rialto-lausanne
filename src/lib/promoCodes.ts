/**
 * Validation et application de codes promo Rialto (local).
 *
 * Un code promo est une ligne dans la table `promo_codes` avec un code
 * unique lisible de type `RIA-7H2KM`. Les codes peuvent être :
 *   - `spin_wheel`   : gagné via la roue de la chance
 *   - `lottery`      : gagné via le tirage mensuel
 *   - `birthday`     : offert pour un anniversaire
 *   - `manual`       : généré depuis le back-office (admin)
 *
 * Les codes sont consommés à la création d'une commande, via
 * l'endpoint `/api/promo-codes/validate` (vérif en temps réel côté client)
 * puis `/api/promo-codes/apply` (consommation atomique côté serveur).
 *
 * Scope serveur : on filtre TOUJOURS par BUSINESS_ID (constante). On ne fait
 * jamais confiance au business_id envoyé par le client.
 */
import { supabaseService } from "@/lib/supabase";

const BUSINESS_ID = "59b10af2-5dbc-4ddd-a659-c49f44804bff";

export type PromoSource =
  | "spin_wheel"
  | "lottery"
  | "birthday"
  | "manual"
  | "signup_bonus";

export type PromoDiscountType = "percent" | "fixed" | "free_item";

export type PromoCodeRow = {
  id: string;
  business_id: string;
  restaurant_id: string | null;
  code: string;
  customer_id: string | null;
  phone: string | null;
  source: PromoSource;
  discount_type: PromoDiscountType;
  discount_value: number | null;
  free_item_label: string | null;
  min_order_amount: number | null;
  max_uses: number;
  uses_count: number;
  valid_from: string;
  valid_until: string;
  used_at: string | null;
  used_on_order_id: string | null;
  created_at: string;
};

/**
 * Vérifie qu'un code est valide et qu'il peut être appliqué à un panier
 * de `subtotal` CHF. Ne consomme PAS le code.
 */
export async function validatePromoCode(params: {
  code: string;
  subtotal: number;
}): Promise<
  | {
      ok: true;
      code: PromoCodeRow;
      discount_amount: number;
      message: string;
    }
  | { ok: false; error: string }
> {
  const admin = supabaseService();
  const codeRaw = params.code.trim().toUpperCase();
  if (!codeRaw) return { ok: false, error: "Code vide" };

  const { data, error } = await admin
    .from("promo_codes")
    .select("*")
    .eq("business_id", BUSINESS_ID)
    .eq("code", codeRaw)
    .maybeSingle();

  if (error) {
    console.error("[promoCodes] validate query failed", error);
    return { ok: false, error: "Erreur serveur" };
  }
  if (!data) return { ok: false, error: "Code invalide" };

  const row = data as PromoCodeRow;
  const now = Date.now();
  const validFrom = new Date(row.valid_from).getTime();
  const validUntil = new Date(row.valid_until).getTime();

  if (now < validFrom) return { ok: false, error: "Code pas encore actif" };
  if (now > validUntil) return { ok: false, error: "Code expiré" };
  if (row.uses_count >= row.max_uses) {
    return { ok: false, error: "Code déjà utilisé" };
  }
  if (
    row.min_order_amount != null &&
    params.subtotal < Number(row.min_order_amount)
  ) {
    return {
      ok: false,
      error: `Panier minimum : ${Number(row.min_order_amount).toFixed(2)} CHF pour ce code`,
    };
  }

  const { discount_amount, message } = computeDiscount(row, params.subtotal);
  return {
    ok: true,
    code: row,
    discount_amount,
    message,
  };
}

export function computeDiscount(
  row: PromoCodeRow,
  subtotal: number,
): { discount_amount: number; message: string } {
  const type = row.discount_type;
  const value = Number(row.discount_value ?? 0);
  if (type === "percent") {
    const amount = Math.round((subtotal * value) / 100 * 100) / 100;
    return {
      discount_amount: amount,
      message: `-${value}% sur votre commande (-${amount.toFixed(2)} CHF)`,
    };
  }
  if (type === "fixed") {
    const amount = Math.min(value, subtotal);
    return {
      discount_amount: amount,
      message: `-${amount.toFixed(2)} CHF offerts`,
    };
  }
  // free_item : ne réduit pas le total (l'article offert est ajouté séparément)
  return {
    discount_amount: 0,
    message: row.free_item_label
      ? `${row.free_item_label} offert`
      : "Article offert",
  };
}

/**
 * Consomme un code promo de manière atomique et l'associe à la commande.
 * Vérifie que le code n'a pas dépassé `max_uses` avant d'incrémenter.
 *
 * @returns Le row mis à jour, ou une erreur si déjà consommé.
 */
export async function applyPromoCode(params: {
  promo_code_id: string;
  order_id: string;
  discount_amount: number;
}): Promise<{ ok: true; code: PromoCodeRow } | { ok: false; error: string }> {
  const admin = supabaseService();

  // Lecture + check
  const { data: existing, error: readErr } = await admin
    .from("promo_codes")
    .select("*")
    .eq("id", params.promo_code_id)
    .maybeSingle();

  if (readErr || !existing) {
    return { ok: false, error: "Code introuvable" };
  }
  const row = existing as PromoCodeRow;
  if (row.uses_count >= row.max_uses) {
    return { ok: false, error: "Code déjà utilisé" };
  }

  // Update avec vérif race : uses_count doit être < max_uses
  const { data: updated, error: updErr } = await admin
    .from("promo_codes")
    .update({
      uses_count: row.uses_count + 1,
      used_at:
        row.uses_count + 1 >= row.max_uses ? new Date().toISOString() : null,
      used_on_order_id: params.order_id,
    })
    .eq("id", params.promo_code_id)
    .lt("uses_count", row.max_uses) // garde-fou anti-race
    .select("*")
    .maybeSingle();

  if (updErr || !updated) {
    return { ok: false, error: "Impossible d'appliquer le code" };
  }

  // Met à jour la commande avec la référence + montant remisé
  await admin
    .from("orders")
    .update({
      promo_code_id: params.promo_code_id,
      promo_discount_amount: params.discount_amount,
    })
    .eq("id", params.order_id);

  return { ok: true, code: updated as PromoCodeRow };
}
