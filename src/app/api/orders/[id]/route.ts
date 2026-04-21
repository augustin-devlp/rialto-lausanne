import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

/**
 * GET /api/orders/[id]
 * Retourne la commande complète (avec items imbriqués) pour l'affichage
 * côté Rialto (page confirmation + page order/[id]).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = supabaseService();

  const { data: order, error } = await sb
    .from("orders")
    .select(
      "id, restaurant_id, order_number, customer_name, customer_phone, payer_phone, requested_pickup_time, status, total_amount, notes, created_at, fulfillment_type, delivery_address, delivery_postal_code, delivery_city, delivery_floor_door, delivery_instructions, delivery_fee",
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

  // On renvoie à la fois order (avec items imbriqués) et items en top-level
  // pour compatibilité rétroactive avec /order/[id] legacy.
  return NextResponse.json({
    order: { ...order, items: items ?? [] },
    items: items ?? [],
  });
}
