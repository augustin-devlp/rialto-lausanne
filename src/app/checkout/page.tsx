import { supabaseServer, RESTAURANT_ID } from "@/lib/supabase";
import CheckoutPageClient from "@/components/checkout/CheckoutPageClient";

export const revalidate = 30;

async function loadRestaurant() {
  const sb = supabaseServer();
  const { data } = await sb
    .from("restaurants")
    .select("id, accepting_orders")
    .eq("id", RESTAURANT_ID)
    .single();
  return data as { id: string; accepting_orders: boolean } | null;
}

export default async function CheckoutPage() {
  const r = await loadRestaurant();
  return (
    <CheckoutPageClient
      restaurantId={r?.id ?? RESTAURANT_ID}
      accepting={r?.accepting_orders ?? true}
    />
  );
}
