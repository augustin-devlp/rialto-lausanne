import { notFound } from "next/navigation";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import ConfirmationClient from "@/components/checkout/ConfirmationClient";
import { intrantsPourCommande } from "@/lib/eta/server";

export const dynamic = "force-dynamic";

async function loadOrder(orderNumber: string) {
  const sb = supabaseService();
  const { data: order } = await sb
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, status, total_amount, created_at, requested_pickup_time, fulfillment_type, delivery_address, delivery_postal_code, delivery_city, delivery_floor_door, delivery_instructions, delivery_zone_id",
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

  // Intrants ETA dès le SSR : la phase dérivée est juste au premier rendu
  // (sans eux, elle retomberait sur le statut brut jusqu'au premier poll).
  let etaIntrants = null;
  try {
    etaIntrants = await intrantsPourCommande(sb, {
      id: order.id as string,
      created_at: order.created_at as string,
      status: order.status as string,
      fulfillment_type: order.fulfillment_type as "pickup" | "delivery",
      delivery_zone_id: (order as { delivery_zone_id?: string | null })
        .delivery_zone_id,
    });
  } catch {
    /* best-effort : le poll les fournira */
  }

  return { ...order, items: items ?? [], eta_intrants: etaIntrants };
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
