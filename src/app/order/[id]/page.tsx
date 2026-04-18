import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import StatusTracker from "@/components/StatusTracker";
import type { Order, OrderItemRow, Restaurant } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
}: {
  params: { id: string };
}) {
  const sb = supabaseServer();

  const { data: order } = await sb
    .from("orders")
    .select(
      "id, restaurant_id, order_number, customer_name, customer_phone, requested_pickup_time, status, total_amount, notes, created_at",
    )
    .eq("id", params.id)
    .single();

  if (!order) return notFound();

  const { data: items } = await sb
    .from("order_items")
    .select(
      "id, order_id, menu_item_id, item_name_snapshot, item_price_snapshot, quantity, selected_options, subtotal, notes",
    )
    .eq("order_id", order.id);

  const { data: restaurant } = await sb
    .from("restaurants")
    .select("name, address, phone")
    .eq("id", order.restaurant_id)
    .single();

  return (
    <main className="min-h-screen bg-surface">
      <header className="border-b border-gray-100 bg-white px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <a
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-rialto font-bold text-white"
          >
            R
          </a>
          <div className="text-base font-bold">{restaurant?.name ?? "Rialto"}</div>
        </div>
      </header>
      <StatusTracker
        order={order as Order}
        items={(items ?? []) as OrderItemRow[]}
        restaurant={
          (restaurant ?? {
            name: "Rialto",
            address: null,
            phone: null,
          }) as Pick<Restaurant, "name" | "address" | "phone">
        }
      />
    </main>
  );
}
