import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { isScanConfigured, requireScanAuth } from "@/lib/scanAuth";
import { renderTemplate } from "@/lib/smsTemplates";
import { sendSms } from "@/lib/brevo";

export const dynamic = "force-dynamic";

/**
 * POST /api/scan/credit  body { customer_card_id }
 *
 * Crédite 1 tampon via la ROUTE SERVEUR ATOMIQUE : appel du RPC
 * `credit_stamp(p_customer_card_id, p_source)` qui porte TOUTE la logique
 * métier (limites 3/jour + 1 récompense/7j, multiplicateur promo, seuil →
 * reset + rewards_claimed+1, historique). Zéro écriture navigateur.
 *
 * Le RPC renvoie un jsonb, retourné TEL QUEL en 200 :
 *   succès : { ok:true, stamps_added, new_stamps, stamps_required, reward_earned }
 *   refus métier : { ok:false, error:"…" }  (reste HTTP 200)
 *
 * Si reward_earned === true : SMS "reward_unlocked" fire-and-forget
 * (template DB uniquement, ne bloque JAMAIS la réponse).
 */

interface CreditResult {
  ok?: boolean;
  reward_earned?: boolean;
  [k: string]: unknown;
}

export async function POST(req: NextRequest) {
  if (!isScanConfigured()) {
    return NextResponse.json(
      { ok: false, error: "scan_not_configured" },
      { status: 500 },
    );
  }
  if (!requireScanAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { ok: false, error: "service_key_missing" },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    customer_card_id?: string;
  } | null;
  const customerCardId = body?.customer_card_id;

  if (!customerCardId) {
    return NextResponse.json(
      { ok: false, error: "customer_card_id requis" },
      { status: 400 },
    );
  }

  const admin = supabaseService();

  const { data, error } = await admin.rpc("credit_stamp", {
    p_customer_card_id: customerCardId,
    p_source: "scan",
  });

  if (error) {
    console.error("[scan/credit] RPC credit_stamp failed", {
      message: error.message,
      customer_card_id: customerCardId,
    });
    return NextResponse.json(
      { ok: false, error: "Erreur serveur" },
      { status: 500 },
    );
  }

  const result = (data ?? {}) as CreditResult;

  // SMS récompense — fire-and-forget, ne bloque jamais la réponse.
  if (result.reward_earned === true) {
    void sendRewardSms(admin, customerCardId).catch(() => {});
  }

  // Le jsonb du RPC est renvoyé TEL QUEL (refus métier = HTTP 200 ok:false).
  return NextResponse.json(result, { status: 200 });
}

/**
 * Envoie le SMS "reward_unlocked" via template DB (skip silencieux si le
 * template est absent/disabled ou si le client n'a pas de téléphone).
 * Cascade sender Rialto → Stampify, identique au signup du Lot 3.
 */
async function sendRewardSms(
  admin: ReturnType<typeof supabaseService>,
  customerCardId: string,
): Promise<void> {
  // Template DB uniquement — pas de fallback TEMPLATE_META.
  const { data: tmpl } = await admin
    .from("sms_templates")
    .select("content, enabled")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("template_key", "reward_unlocked")
    .maybeSingle();

  if (!tmpl || tmpl.enabled === false || !tmpl.content) {
    console.log("[scan/credit] reward_unlocked template absent/disabled, skip SMS");
    return;
  }

  // Récupère téléphone + prénom (customers) et libellé récompense (loyalty_cards).
  const { data: cardRow } = await admin
    .from("customer_cards")
    .select(
      `customer:customer_id (phone, first_name),
       card:card_id (reward_description)`,
    )
    .eq("id", customerCardId)
    .maybeSingle();

  const rawCustomer = (cardRow as { customer?: unknown } | null)?.customer;
  const customer = (Array.isArray(rawCustomer) ? rawCustomer[0] : rawCustomer) as
    | { phone?: string | null; first_name?: string | null }
    | undefined;
  const rawCard = (cardRow as { card?: unknown } | null)?.card;
  const card = (Array.isArray(rawCard) ? rawCard[0] : rawCard) as
    | { reward_description?: string | null }
    | undefined;

  const phone = customer?.phone?.trim();
  if (!phone) {
    console.log("[scan/credit] no phone on card, skip reward SMS");
    return;
  }

  const content = renderTemplate(tmpl.content, {
    customer_name: customer?.first_name ?? "",
    reward_label: card?.reward_description ?? "",
  });

  const maskedPhone =
    phone.length >= 6 ? phone.slice(0, 4) + "***" + phone.slice(-2) : phone;

  // Cascade sender : Rialto → Stampify (fallback FR), comme le signup.
  try {
    await sendSms(phone, content, "Rialto");
    console.log("[scan/credit] reward SMS sent sender=Rialto", { masked_phone: maskedPhone });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("sender") || msg.includes("400")) {
      await sendSms(phone, content, "Stampify");
      console.log("[scan/credit] reward SMS sent sender=Stampify", { masked_phone: maskedPhone });
    } else {
      throw err;
    }
  }
}
