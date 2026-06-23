import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/orders/[orderNumber]/reorder
 *
 * Phase 11 C7 — Retourne les items d'une ancienne commande Rialto dans
 * le format CartItem attendu par le client, pour "Recommander en 1 clic".
 *
 * Les items absents du menu actuel (plats retirés) sont filtrés —
 * on indique unavailable_count en response pour un feedback UX.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { orderNumber: string } },
) {
  const admin = supabaseService();

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, status")
    .eq("order_number", params.orderNumber)
    .eq("restaurant_id", RESTAURANT_ID)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const { data: items } = await admin
    .from("order_items")
    .select(
      "menu_item_id, item_name_snapshot, item_price_snapshot, quantity, selected_options, notes",
    )
    .eq("order_id", order.id);

  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, cart_items: [], unavailable_count: 0 });
  }

  // Verify menu items still exist and get their current price
  const ids = items.map((i) => i.menu_item_id).filter(Boolean) as string[];
  const { data: menuItems } = await admin
    .from("menu_items")
    .select("id, name, price, is_available")
    .in("id", ids);

  const availableMap = new Map(
    (menuItems ?? []).map((m) => [m.id as string, m]),
  );

  type CartItemDTO = {
    key: string;
    menu_item_id: string;
    name: string;
    base_price: number;
    quantity: number;
    options: Array<{ group: string; name: string; extra_price: number }>;
    notes: string;
    unit_price: number;
    subtotal: number;
  };

  const cartItems: CartItemDTO[] = [];
  let unavailable = 0;

  for (const it of items) {
    const menuItem = availableMap.get(it.menu_item_id as string);
    if (!menuItem || menuItem.is_available === false) {
      unavailable += 1;
      continue;
    }
    const options = Array.isArray(it.selected_options)
      ? (it.selected_options as Array<{
          group?: string;
          name?: string;
          extra_price?: number;
        }>).map((o) => ({
          group: o.group ?? "",
          name: o.name ?? "",
          extra_price: Number(o.extra_price ?? 0),
        }))
      : [];
    const basePrice = Number(menuItem.price ?? it.item_price_snapshot ?? 0);
    const extraSum = options.reduce((s, o) => s + Number(o.extra_price ?? 0), 0);
    const unitPrice = basePrice + extraSum;
    const key = `${it.menu_item_id}::${options
      .map((o) => `${o.group}:${o.name}`)
      .sort()
      .join("|")}::${it.notes ?? ""}`;
    cartItems.push({
      key,
      menu_item_id: it.menu_item_id as string,
      name: (menuItem.name as string) ?? (it.item_name_snapshot as string),
      base_price: basePrice,
      quantity: Number(it.quantity ?? 1),
      options,
      notes: (it.notes as string) ?? "",
      unit_price: unitPrice,
      subtotal: unitPrice * Number(it.quantity ?? 1),
    });
  }

  return NextResponse.json({
    ok: true,
    order_number: order.order_number,
    cart_items: cartItems,
    unavailable_count: unavailable,
  });
}
