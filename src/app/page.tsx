import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { supabaseServer, RESTAURANT_ID } from "@/lib/supabase";
import HeroSection from "@/components/home/HeroSection";
import SignatureDishes from "@/components/home/SignatureDishes";
import WhyOrderDirect from "@/components/home/WhyOrderDirect";
import LocationHours from "@/components/home/LocationHours";
import ReviewsCarousel from "@/components/home/ReviewsCarousel";
import SiteFooter from "@/components/home/SiteFooter";
import AddressRequiredToast from "@/components/home/AddressRequiredToast";
import RetourClient from "@/components/home/RetourClient";

// Rendu dynamique : la connexion Supabase se fait au runtime, jamais au build
// (évite "supabaseUrl is required" pendant la génération statique).
export const dynamic = "force-dynamic";

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

export default async function HomePage({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  // ANTI-FLASH (finitions 20.08) : un client déjà qualifié (cookie-drapeau
  // posé par writeAddress) est redirigé vers /menu AVANT tout rendu — il
  // ne voit plus jamais l'écran d'adresse par accident. ?need_address=1
  // (demande explicite de modification) désactive le raccourci. La
  // re-qualification silencieuse des valeurs de zone vit sur /menu.
  if (
    searchParams?.need_address !== "1" &&
    cookies().get("rialto_adresse")?.value === "1"
  ) {
    redirect("/menu");
  }

  const restaurant = await loadRestaurant();
  const minOrderFallback = restaurant?.order_min_amount ?? 25;
  const restaurantId = restaurant?.id ?? RESTAURANT_ID;

  return (
    <main className="min-h-screen">
      {/* Toast adresse requise (Phase 7 FIX 1) — lit ?need_address=1
          dans les searchParams, client-only donc wrapped en Suspense */}
      <Suspense fallback={null}>
        <AddressRequiredToast />
        {/* É8 : client connu -> re-qualification silencieuse puis /menu. */}
        <RetourClient restaurantId={restaurantId} />
      </Suspense>
      {/* L'AppHeader global (layout) a remplacé le SiteHeader local (refonte 20.08). */}
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
