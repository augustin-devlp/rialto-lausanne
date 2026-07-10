import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { canonicalE164 } from "@/lib/phoneVariants";

export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe
 * Body (1) legacy: { customer_card_id: string, subscription: PushSubscriptionJSON }
 * Body (2) phone:  { phone?: string, customer_id?: string, subscription: PushSubscriptionJSON }
 *
 * Enregistre une souscription Web Push pour une carte client OU directement
 * par phone / customer_id (app Rialto PWA). Le 2e mode permet la cascade
 * push->SMS (l'envoi reste côté loyalty-cards, lot dashboard).
 *
 * ⚠️ Portée en local (même-origine, service-role — la RLS deny-all de
 * push_subscriptions impose le service-role même là où la source anon
 * suffisait). CORS retiré (route same-origin).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    customer_card_id?: string;
    customer_id?: string | null;
    phone?: string;
    subscription: {
      endpoint: string;
      keys: { auth: string; p256dh: string };
    };
  };

  const { customer_card_id, subscription } = body;
  const phone = body.phone ?? undefined;
  const providedCustomerId = body.customer_id ?? undefined;
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return NextResponse.json(
      { error: "subscription (endpoint + keys) requis" },
      { status: 400 },
    );
  }

  // Mode 2 : subscribe par phone OU customer_id (app Rialto)
  if ((phone || providedCustomerId) && !customer_card_id) {
    const admin = supabaseService();
    // ⚠️ D4 : la source normalisait via le strip-regex `normalizePhone` de
    // @/lib/analytics puis full-scan customers + compare. On garde la MÊME
    // stratégie tolérante (full-scan + compare) mais avec la normalisation
    // E.164 locale de rialto (canonicalE164, comme les lookups des lots 3+)
    // — normalisation E.164 locale, équivalent fonctionnel — décision D4.
    const phoneNorm = phone ? canonicalE164(phone) : null;
    const ua = req.headers.get("user-agent") ?? null;

    let customerId = providedCustomerId ?? null;
    let effectivePhone = phoneNorm;
    if (!customerId && phoneNorm) {
      const { data: allCustomers } = await admin
        .from("customers")
        .select("id, phone");
      const match = (allCustomers ?? []).find(
        (c) => canonicalE164(c.phone ?? "") === phoneNorm,
      );
      customerId = match?.id ?? null;
    }
    if (!effectivePhone && customerId) {
      const { data: cust } = await admin
        .from("customers")
        .select("phone")
        .eq("id", customerId)
        .single();
      effectivePhone = cust?.phone ? canonicalE164(cust.phone) : null;
    }

    const { error } = await admin
      .from("push_subscriptions")
      .upsert(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          subscription,
          customer_id: customerId,
          phone: effectivePhone,
          user_agent: ua,
          is_active: true,
          failure_count: 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      success: true,
      mode: "phone",
      customer_id: customerId,
    });
  }

  // Mode 1 legacy : customer_card_id
  if (!customer_card_id) {
    return NextResponse.json(
      { error: "customer_card_id or phone required" },
      { status: 400 },
    );
  }

  const supabase = supabaseService();

  // Verify customer card exists
  const { data: cc } = await supabase
    .from("customer_cards")
    .select("id")
    .eq("id", customer_card_id)
    .single();

  if (!cc) {
    return NextResponse.json(
      { error: "Customer card not found" },
      { status: 404 },
    );
  }

  // Upsert subscription by endpoint to avoid duplicates
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(
      {
        customer_card_id,
        subscription,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        is_active: true,
      },
      { onConflict: "endpoint" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, mode: "card" });
}

/**
 * DELETE /api/push/subscribe
 * Body: { endpoint: string } OR query ?endpoint=
 *
 * Supprime une souscription Web Push (désabonnement).
 * ⚠️ Aucune vérification d'ownership (hérité D3, backlog sécurité).
 */
export async function DELETE(req: NextRequest) {
  let endpoint: string | null = null;
  const url = new URL(req.url);
  endpoint = url.searchParams.get("endpoint");
  if (!endpoint) {
    try {
      const b = (await req.json()) as { endpoint?: string };
      endpoint = b.endpoint ?? null;
    } catch {
      /* no body */
    }
  }
  if (!endpoint) {
    return NextResponse.json(
      { error: "endpoint required" },
      { status: 400 },
    );
  }

  const supabase = supabaseService();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
