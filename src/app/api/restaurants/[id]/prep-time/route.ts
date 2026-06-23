import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { calculatePrepTime, type FulfillmentType } from "@/lib/prepTime";

export const dynamic = "force-dynamic";

/**
 * GET /api/restaurants/[id]/prep-time?type=pickup|delivery&postal_code=XXXX
 * Retourne le temps de prep adaptatif actuel.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") ?? "pickup") as FulfillmentType;
  const postalCode = url.searchParams.get("postal_code");

  const admin = supabaseService();

  const { data: restaurant } = await admin
    .from("restaurants")
    .select("pickup_prep_time_minutes, delivery_prep_time_minutes")
    .eq("id", params.id)
    .maybeSingle();
  if (!restaurant) {
    return NextResponse.json(
      { error: "Restaurant introuvable" },
      { status: 404 },
    );
  }

  const { count: activeOrdersCount } = await admin
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", params.id)
    .in("status", ["new", "accepted", "preparing"]);

  let zoneEta: number | undefined;
  if (type === "delivery" && postalCode) {
    const { data: zone } = await admin
      .from("delivery_zones")
      .select("estimated_delivery_minutes")
      .eq("restaurant_id", params.id)
      .eq("postal_code", postalCode)
      .eq("is_active", true)
      .maybeSingle();
    if (zone) zoneEta = zone.estimated_delivery_minutes as number;
  }

  const result = calculatePrepTime(
    type,
    activeOrdersCount ?? 0,
    {
      pickup_prep_time_minutes: restaurant.pickup_prep_time_minutes ?? 15,
      delivery_prep_time_minutes: restaurant.delivery_prep_time_minutes ?? 30,
    },
    zoneEta,
  );

  return NextResponse.json({
    ...result,
    active_orders_count: activeOrdersCount ?? 0,
    fulfillment_type: type,
  });
}
