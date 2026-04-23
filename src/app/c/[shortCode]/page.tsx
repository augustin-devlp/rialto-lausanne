import { notFound } from "next/navigation";
import { Suspense } from "react";
import LoyaltyCardView from "./LoyaltyCardView";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

export const dynamic = "force-dynamic";

type PublicCard = {
  id: string;
  short_code: string;
  current_stamps: number;
  stamps_required: number;
  reward_description: string;
  card_name: string;
  qr_code_value: string;
  first_name: string;
  phone_masked: string;
  is_fully_activated?: boolean;
  has_birthday?: boolean;
  customer_id?: string | null;
};

async function loadCard(shortCode: string): Promise<PublicCard | null> {
  try {
    const res = await fetch(
      `${STAMPIFY_BASE}/api/loyalty-cards/lookup?short_code=${encodeURIComponent(shortCode)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { card?: PublicCard };
    return body.card ?? null;
  } catch (err) {
    console.error("[public-card] fetch failed", err);
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
