import { notFound } from "next/navigation";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import ConfirmationClient from "@/components/checkout/ConfirmationClient";

export const dynamic = "force-dynamic";

async function loadOrder(orderNumber: string) {
  const sb = supabaseService();
  const { data: order } = await sb
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, status, total_amount, created_at, requested_pickup_time, fulfillment_type, delivery_address, delivery_postal_code, delivery_city, delivery_floor_door, delivery_instructions",
    )
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await sb
    .from("order_items")
    .select(
      "item_name_snapshot, item_price_snapshot, quantity, selected_options, subtotal, notes",
    )
    .eq("order_id", order.id);

  return { ...order, items: items ?? [] };
}

export default async function ConfirmationPage({
  params,
}: {
  params: { orderNumber: string };
}) {
  const order = await loadOrder(decodeURIComponent(params.orderNumber));
  if (!order) return notFound();

  return <ConfirmationClient order={order as any} />;
}
