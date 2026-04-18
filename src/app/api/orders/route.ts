import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { sendSMS } from "@/lib/brevo";

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
  /**
   * Full ISO 8601 timestamp (e.g. "2026-04-18T19:15:00.000Z").
   * Constructed client-side from the user's local time zone so it reflects
   * the actual pickup instant. Stored as-is in Supabase.
   */
  requested_pickup_time: string;
  notes: string | null;
  items: IncomingItem[];
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
    .select("id, name, order_min_amount, accepting_orders, phone, address")
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

  const total = body.items.reduce((s, it) => s + Number(it.subtotal), 0);
  if (total < Number(restaurant.order_min_amount)) {
    return NextResponse.json(
      { error: `Commande minimum : ${restaurant.order_min_amount} CHF` },
      { status: 400 },
    );
  }

  const pickupISO = parsePickupISO(body.requested_pickup_time);
  if (!pickupISO) {
    return NextResponse.json(
      { error: "Heure de retrait invalide" },
      { status: 400 },
    );
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
      requested_pickup_time: pickupISO,
      status: "new",
      total_amount: total,
      notes: body.notes,
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

  // SMS confirmation (non-blocking)
  void sendSMS(
    body.customer_phone,
    `Rialto : commande ${order.order_number} reçue ! Nous vous confirmons la prise en charge dans quelques instants.`,
  );

  return NextResponse.json({ order });
}
