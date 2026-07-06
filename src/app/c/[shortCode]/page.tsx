import { notFound } from "next/navigation";
import { Suspense } from "react";
import LoyaltyCardView from "./LoyaltyCardView";
import { lookupCardByShortCode, type PublicCard } from "@/lib/loyaltyCards";

export const dynamic = "force-dynamic";

async function loadCard(shortCode: string): Promise<PublicCard | null> {
  try {
    // Lecture DB directe (Server Component — pas de fetch HTTP relatif
    // possible côté serveur). Le short_code est normalisé trim+toUpperCase
    // comme le faisait la route /api/loyalty-cards/lookup.
    return await lookupCardByShortCode(shortCode.trim().toUpperCase());
  } catch (err) {
    console.error("[public-card] lookup failed", err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { shortCode: string };
}) {
  return {
    title: `Carte Rialto Club · ${params.shortCode.toUpperCase()}`,
    description:
      "Votre carte de fidélité Rialto avec QR code à montrer au restaurant.",
  };
}

export default async function RialtoCardPage({
  params,
}: {
  params: { shortCode: string };
}) {
  const card = await loadCard(decodeURIComponent(params.shortCode));
  if (!card) return notFound();
  // Suspense : LoyaltyCardView utilise useSearchParams (toast welcome)
  return (
    <Suspense fallback={null}>
      <LoyaltyCardView card={card} />
    </Suspense>
  );
}
