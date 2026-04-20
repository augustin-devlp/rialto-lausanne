import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { sendSMS } from "@/lib/brevo";
import {
  hhmmToMinutes,
  toZurichDate,
  toZurichHHMM,
} from "@/lib/timezone";
import {
  buildConfirmationContext,
  getConfirmationTemplate,
  renderConfirmationTemplate,
} from "@/lib/smsTemplate";

type IncomingItem = {
  menu_item_id: string;
  item_name_snapshot: string;
  item_price_snapshot: number;
  quantity: number;
  selected_options: { group: string; name: string; extra_price: number }[];
  subtotal: number;
  notes: string | null;
};

type Payload = {
  restaurant_id: string;
  customer_name: string;
  customer_phone: string;
  payer_phone?: string | null;
  requested_pickup_time: string | null;
  notes: string | null;
  items: IncomingItem[];
  // Delivery fields
  fulfillment_type?: "pickup" | "delivery";
  delivery_address?: string | null;
  delivery_postal_code?: string | null;
  delivery_city?: string | null;
  delivery_floor_door?: string | null;
  delivery_instructions?: string | null;
  delivery_zone_id?: string | null;
};

function parsePickupISO(value: string): string | null {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Payload | null;
  if (
    !body ||
    !body.restaurant_id ||
    !body.customer_name ||
    !body.customer_phone ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  const sb = supabaseService();

  const { data: restaurant, error: rErr } = await sb
    .from("restaurants")
    .select(
      "id, name, order_min_amount, accepting_orders, phone, address, order_open_time, order_close_time, prep_time_minutes, offers_pickup, offers_delivery",
    )
    .eq("id", body.restaurant_id)
    .single();
  if (rErr || !restaurant) {
    return NextResponse.json({ error: "Restaurant introuvable" }, { status: 404 });
  }
  if (!restaurant.accepting_orders) {
    return NextResponse.json(
      { error: "Le restaurant ne prend plus de commandes pour le moment." },
      { status: 409 },
    );
  }

  const subtotal = body.items.reduce((s, it) => s + Number(it.subtotal), 0);
  const fulfillmentType: "pickup" | "delivery" = body.fulfillment_type ?? "pickup";

  // --- Validation delivery ---
  let deliveryFee = 0;
  let deliveryZoneId: string | null = null;
  let deliveryCity: string | null = null;

  if (fulfillmentType === "delivery") {
    if (restaurant.offers_delivery === false) {
      return NextResponse.json(
        { error: "La livraison n'est pas disponible pour ce restaurant." },
        { status: 409 },
      );
    }
    if (!body.delivery_address?.trim() || !body.delivery_postal_code?.trim()) {
      return NextResponse.json(
        { error: "Adresse et code postal requis pour la livraison." },
        { status: 400 },
      );
    }
    const { data: zone } = await sb
      .from("delivery_zones")
      .select(
        "id, postal_code, city, delivery_fee, min_order_amount, is_active",
      )
      .eq("restaurant_id", body.restaurant_id)
      .eq("postal_code", body.delivery_postal_code.trim())
      .eq("is_active", true)
      .maybeSingle();
    if (!zone) {
      return NextResponse.json(
        {
          error: `Nous ne livrons pas au ${body.delivery_postal_code.trim()}. Optez pour le retrait en magasin.`,
        },
        { status: 400 },
      );
    }
    if (subtotal < Number(zone.min_order_amount)) {
      return NextResponse.json(
        {
          error: `Commande minimum pour la livraison : ${Number(
            zone.min_order_amount,
          ).toFixed(2)} CHF.`,
        },
        { status: 400 },
      );
    }
    deliveryFee = Number(zone.delivery_fee);
    deliveryZoneId = zone.id as string;
    deliveryCity = (zone.city as string | null) ?? body.delivery_city ?? null;
  } else {
    // Pickup : validation du panier min restaurant
    if (subtotal < Number(restaurant.order_min_amount)) {
      return NextResponse.json(
        { error: `Commande minimum : ${restaurant.order_min_amount} CHF` },
        { status: 400 },
      );
    }
  }

  const total = subtotal + deliveryFee;

  // --- Heure de retrait / livraison ---
  // Pickup : obligatoire. Delivery : optionnelle (asap possible).
  let pickupISO: string | null = null;
  if (body.requested_pickup_time) {
    pickupISO = parsePickupISO(body.requested_pickup_time);
    if (!pickupISO) {
      return NextResponse.json(
        { error: "Heure invalide" },
        { status: 400 },
      );
    }
  } else if (fulfillmentType === "pickup") {
    return NextResponse.json(
      { error: "Heure de retrait requise." },
      { status: 400 },
    );
  }

  // --- Validation horaires / prep time pour PICKUP uniquement ---
  if (fulfillmentType === "pickup" && pickupISO) {
    const pickupDate = new Date(pickupISO);
    const now = new Date();
    const pickupHHMM = toZurichHHMM(pickupDate);
    const pickupDateZurich = toZurichDate(pickupDate);
    const nowDateZurich = toZurichDate(now);
    const earliestHHMM = toZurichHHMM(
      new Date(now.getTime() + restaurant.prep_time_minutes * 60_000),
    );
    const openHHMM = String(restaurant.order_open_time).slice(0, 5);
    const closeHHMM = String(restaurant.order_close_time).slice(0, 5);
    const pickupMin = hhmmToMinutes(pickupHHMM);
    const openMin = hhmmToMinutes(openHHMM);
    const closeMin = hhmmToMinutes(closeHHMM);

    if (pickupMin < openMin) {
      return NextResponse.json(
        {
          error: `Les commandes sont acceptées à partir de ${openHHMM}.`,
        },
        { status: 400 },
      );
    }
    if (pickupMin > closeMin) {
      return NextResponse.json(
        {
          error: `Les commandes sont acceptées jusqu'à ${closeHHMM}.`,
        },
        { status: 400 },
      );
    }
    if (pickupDateZurich === nowDateZurich) {
      const earliestMin = hhmmToMinutes(earliestHHMM);
      if (pickupMin < earliestMin) {
        return NextResponse.json(
          {
            error: `Prévoyez au moins ${restaurant.prep_time_minutes} min. Plus tôt possible : ${earliestHHMM}.`,
          },
          { status: 400 },
        );
      }
    }
  }

  const { data: nbData, error: nbErr } = await sb.rpc("generate_order_number", {
    p_restaurant: body.restaurant_id,
  });
  const orderNumber = nbErr || !nbData ? `X-${Date.now()}` : (nbData as string);

  const { data: order, error: oErr } = await sb
    .from("orders")
    .insert({
      restaurant_id: body.restaurant_id,
      order_number: orderNumber,
      customer_name: body.customer_name,
      customer_phone: body.customer_phone,
      payer_phone: body.payer_phone ?? null,
      requested_pickup_time: pickupISO,
      status: "new",
      total_amount: total,
      notes: body.notes,
      fulfillment_type: fulfillmentType,
      delivery_address: body.delivery_address ?? null,
      delivery_postal_code: body.delivery_postal_code ?? null,
      delivery_city: deliveryCity,
      delivery_floor_door: body.delivery_floor_door ?? null,
      delivery_instructions: body.delivery_instructions ?? null,
      delivery_fee: deliveryFee,
      delivery_zone_id: deliveryZoneId,
    })
    .select("id, order_number")
    .single();

  if (oErr || !order) {
    console.error("[orders] insert failed", oErr);
    return NextResponse.json(
      { error: "Impossible de créer la commande" },
      { status: 500 },
    );
  }

  const rows = body.items.map((it) => ({
    order_id: order.id,
    menu_item_id: it.menu_item_id,
    item_name_snapshot: it.item_name_snapshot,
    item_price_snapshot: it.item_price_snapshot,
    quantity: it.quantity,
    selected_options: it.selected_options,
    subtotal: it.subtotal,
    notes: it.notes,
  }));

  const { error: iErr } = await sb.from("order_items").insert(rows);
  if (iErr) {
    console.error("[orders] items insert failed", iErr);
    await sb.from("orders").delete().eq("id", order.id);
    return NextResponse.json(
      { error: "Impossible d'enregistrer les articles" },
      { status: 500 },
    );
  }

  await sb.from("order_status_history").insert({
    order_id: order.id,
    old_status: null,
    new_status: "new",
    changed_by: "customer",
  });

  // Lie la commande à un customer Stampify natif (customers +
  // customer_cards pour le programme Rialto). Si aucun compte n'existe
  // encore, on en crée un vide pour garder le lien — la carte fidélité
  // pourra être "activée" plus tard par le client sur /order/[id] ou
  // l'onglet Fidélité.
  const RIALTO_CARD_ID = "f4cb1a3f-fc5c-40eb-87db-8d2c2b0a8b5f";
  const [firstName, ...rest] = body.customer_name.split(" ");
  const lastName = rest.join(" ") || "";

  const { data: existingCards } = await sb
    .from("customer_cards")
    .select("id, customer_id, customers!inner (id, phone)")
    .eq("card_id", RIALTO_CARD_ID)
    .eq("customers.phone", body.customer_phone)
    .limit(1);

  let customerId: string | null = null;
  if (existingCards && existingCards.length > 0) {
    customerId = existingCards[0].customer_id as string;
  } else {
    // Crée un customer + customer_card vide
    const { data: newCustomer } = await sb
      .from("customers")
      .insert({
        first_name: firstName || "Client",
        last_name: lastName,
        phone: body.customer_phone,
      })
      .select("id")
      .single();
    if (newCustomer) {
      customerId = newCustomer.id;
      await sb.from("customer_cards").insert({
        customer_id: newCustomer.id,
        card_id: RIALTO_CARD_ID,
        current_stamps: 0,
        qr_code_value: crypto.randomUUID(),
        rewards_claimed: 0,
      });
    }
  }

  if (customerId) {
    await sb.from("orders").update({ customer_id: customerId }).eq("id", order.id);
  }

  // SMS confirmation templaté (non-blocking)
  void (async () => {
    try {
      const tmpl = await getConfirmationTemplate(body.restaurant_id);
      if (!tmpl.enabled) return;
      const ctx = buildConfirmationContext({
        order: {
          id: order.id,
          order_number: order.order_number,
          customer_name: body.customer_name,
          total_amount: total,
          requested_pickup_time: pickupISO ?? new Date().toISOString(),
        },
        restaurant: {
          name: restaurant.name,
          phone: restaurant.phone,
          address: restaurant.address,
        },
        siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://rialto-lausanne.ch",
      });
      const content = renderConfirmationTemplate(tmpl.content, ctx);
      await sendSMS(body.customer_phone, content);
    } catch (err) {
      console.error("[sms] confirmation failed", err);
    }
  })();

  // Push dashboard (non-blocking, best-effort). Le secret + l'URL sont
  // configurés côté Vercel. Si indisponibles en dev, on skip.
  const pickupTimeLabel = pickupISO
    ? toZurichHHMM(new Date(pickupISO))
    : "dès que possible";
  void notifyDashboard({
    restaurant_id: body.restaurant_id,
    order_number: order.order_number,
    customer_name: body.customer_name,
    total: total,
    pickup_time_hhmm: pickupTimeLabel,
    fulfillment_type: fulfillmentType,
  });

  // PDF receipt email (fire-and-forget)
  void sendReceiptEmail(order.id);

  return NextResponse.json({ order });
}

async function sendReceiptEmail(orderId: string): Promise<void> {
  const url = process.env.LOYALTY_CARDS_BASE_URL
    ?? process.env.LOYALTY_CARDS_WEBHOOK_URL?.replace(
      /\/api\/push\/dashboard-send$/,
      "",
    )
    ?? "https://www.stampify.ch";
  const secret = process.env.ORDER_WEBHOOK_SECRET;
  if (!secret) {
    console.log("[receipt-email] skipped (ORDER_WEBHOOK_SECRET missing)");
    return;
  }
  try {
    await fetch(`${url}/api/orders/${orderId}/receipt-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
      },
    });
  } catch (err) {
    console.error("[receipt-email] failed", err);
  }
}

async function notifyDashboard(input: {
  restaurant_id: string;
  order_number: string;
  customer_name: string;
  total: number;
  pickup_time_hhmm: string;
  fulfillment_type?: "pickup" | "delivery";
}): Promise<void> {
  const url = process.env.LOYALTY_CARDS_WEBHOOK_URL;
  const secret = process.env.ORDER_WEBHOOK_SECRET;
  if (!url || !secret) {
    console.log("[webhook] skipped (LOYALTY_CARDS_WEBHOOK_URL or ORDER_WEBHOOK_SECRET missing)");
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-webhook-secret": secret,
      },
      body: JSON.stringify({
        restaurant_id: input.restaurant_id,
        title: `Nouvelle commande ${input.order_number}`,
        body: `${input.customer_name} · ${input.total.toFixed(2)} CHF · ${
          input.fulfillment_type === "delivery" ? "🚴 Livraison" : "🏪 Retrait"
        } ${input.pickup_time_hhmm}`,
        url: "/dashboard/commandes",
        tag: `order-${input.order_number}`,
      }),
    });
  } catch (err) {
    console.error("[webhook] dashboard push failed", err);
  }
}
