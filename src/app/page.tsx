import { Suspense } from "react";
import { supabaseServer, RESTAURANT_ID } from "@/lib/supabase";
import SiteHeader from "@/components/home/SiteHeader";
import HeroSection from "@/components/home/HeroSection";
import SignatureDishes from "@/components/home/SignatureDishes";
import WhyOrderDirect from "@/components/home/WhyOrderDirect";
import LocationHours from "@/components/home/LocationHours";
import ReviewsCarousel from "@/components/home/ReviewsCarousel";
import SiteFooter from "@/components/home/SiteFooter";
import AddressRequiredToast from "@/components/home/AddressRequiredToast";

export const revalidate = 300;

async function loadRestaurant() {
  const sb = supabaseServer();
  const { data } = await sb
    .from("restaurants")
    .select("id, order_min_amount, accepting_orders")
    .eq("id", RESTAURANT_ID)
    .single();
  return data as {
    id: string;
    order_min_amount: number;
    accepting_orders: boolean;
  } | null;
}

export default async function HomePage() {
  const restaurant = await loadRestaurant();
  const minOrderFallback = restaurant?.order_min_amount ?? 25;
  const restaurantId = restaurant?.id ?? RESTAURANT_ID;

  return (
    <main className="min-h-screen">
      {/* Toast adresse requise (Phase 7 FIX 1) — lit ?need_address=1
          dans les searchParams, client-only donc wrapped en Suspense */}
      <Suspense fallback={null}>
        <AddressRequiredToast />
      </Suspense>
      <SiteHeader transparentOnTop />
      <HeroSection
        restaurantId={restaurantId}
        minOrderFallback={minOrderFallback}
      />
      <SignatureDishes />
      <WhyOrderDirect />
      <LocationHours />
      <ReviewsCarousel />
      <SiteFooter />
    </main>
  );
}
