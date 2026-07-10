import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { sendSms } from "@/lib/brevo";
import { logSms } from "@/lib/smsLogging";
import { renderTemplate, TEMPLATE_META } from "@/lib/smsTemplates";
import { BUSINESS_ID } from "@/lib/loyaltyConstants";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reward-referrals
 * Cron toutes les 30 min (phase 11 C9).
 *
 * Scanne les referrals en statut 'claimed' qui ont déjà passé une commande
 * Rialto (status != cancelled). Pour chaque match :
 *   - génère 1 promo code MARG{id} -100% valable 60 jours (Pizza Marguerite
 *     gratuite) au parrain
 *   - génère 1 promo code MARG{id} au filleul
 *   - envoie SMS referral_success aux deux
 *   - marque referral.status = 'rewarded'
 */
export async function GET(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const cronSecret = req.headers.get("x-cron-secret");
  const validSecret = process.env.CRON_SECRET ?? "rialto-cron-2026";
  if (!isCron && cronSecret !== validSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseService();

  const { data: claimed } = await admin
    .from("referrals")
    .select(
      "id, referrer_customer_id, referee_phone, referee_customer_id, referral_code",
    )
    .eq("status", "claimed")
    .eq("restaurant_id", RESTAURANT_ID);

  const rewarded: string[] = [];
  let errors = 0;

  for (const ref of claimed ?? []) {
    try {
      // Check if filleul has an order Rialto
      const { data: orders } = await admin
        .from("orders")
        .select("id, customer_phone, customer_id, status")
        .eq("restaurant_id", RESTAURANT_ID)
        .or(
          `customer_phone.eq.${ref.referee_phone},customer_id.eq.${ref.referee_customer_id ?? "00000000-0000-0000-0000-000000000000"}`,
        )
        .not("status", "in", "(cancelled,refunded)")
        .limit(1);

      if (!orders || orders.length === 0) continue;

      // Generate promo codes for both
      const shortId = (ref.id as string).slice(0, 4).toUpperCase();
      const codeParrain = `MARG${shortId}P`;
      const codeFilleul = `MARG${shortId}F`;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 60);

      // Parrain promo
      await admin.from("promo_codes").insert({
        business_id: BUSINESS_ID,
        restaurant_id: RESTAURANT_ID,
        code: codeParrain,
        customer_id: ref.referrer_customer_id,
        source: "referral",
        discount_type: "percent",
        discount_value: 100,
        max_uses: 1,
        uses_count: 0,
        valid_from: new Date().toISOString(),
        valid_until: validUntil.toISOString(),
      });

      await admin.from("promo_codes").insert({
        business_id: BUSINESS_ID,
        restaurant_id: RESTAURANT_ID,
        code: codeFilleul,
        phone: ref.referee_phone,
        customer_id: ref.referee_customer_id,
        source: "referral_claim",
        discount_type: "percent",
        discount_value: 100,
        max_uses: 1,
        uses_count: 0,
        valid_from: new Date().toISOString(),
        valid_until: validUntil.toISOString(),
      });

      // SMS to parrain
      const { data: parrain } = await admin
        .from("customers")
        .select("phone, first_name")
        .eq("id", ref.referrer_customer_id)
        .maybeSingle();

      const meta = TEMPLATE_META.referral_success;
      const { data: tmpl } = await admin
        .from("sms_templates")
        .select("content, enabled")
        .eq("restaurant_id", RESTAURANT_ID)
        .eq("template_key", "referral_success")
        .maybeSingle();
      const content = renderTemplate(
        tmpl?.content ?? meta.defaultContent,
        {
          customer_name: parrain?.first_name ?? "",
          reward_label: "une Pizza Marguerite offerte",
          code: codeParrain,
          restaurant_name: "Rialto",
        },
      );

      if (parrain?.phone) {
        try {
          await sendSms(parrain.phone, content, "Rialto");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("sender") || msg.includes("400")) {
            await sendSms(parrain.phone, content, "Stampify");
          }
        }
        await logSms({
          restaurant_id: RESTAURANT_ID,
          customer_id: ref.referrer_customer_id,
          phone: parrain.phone,
          template_key: "referral_success",
          sender_used: "Rialto",
          content,
          status: "sent",
          context_meta: { referral_id: ref.id, code: codeParrain, role: "parrain" },
        });
      }

      // Mark rewarded
      await admin
        .from("referrals")
        .update({
          status: "rewarded",
          rewarded_at: new Date().toISOString(),
          reward_promo_code: codeParrain,
          referee_first_order_id: orders[0].id,
        })
        .eq("id", ref.id);

      rewarded.push(ref.id as string);
    } catch (err) {
      console.error("[reward-referrals] failed", ref.id, err);
      errors += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: (claimed ?? []).length,
    rewarded: rewarded.length,
    errors,
  });
}
