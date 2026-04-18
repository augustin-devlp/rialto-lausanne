import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = supabaseService();

  const { data: order, error } = await sb
    .from("orders")
    .select(
      "id, restaurant_id, order_number, customer_name, customer_phone, requested_pickup_time, status, total_amount, notes, created_at",
    )
    .eq("id", params.id)
    .single();

  if (error || !order) {
    return NextResponse.json(
      { error: "Commande introuvable" },
      { status: 404 },
    );
  }

  const { data: items } = await sb
    .from("order_items")
    .select(
      "id, order_id, menu_item_id, item_name_snapshot, item_price_snapshot, quantity, selected_options, subtotal, notes",
    )
    .eq("order_id", order.id);

  return NextResponse.json({ order, items: items ?? [] });
}
