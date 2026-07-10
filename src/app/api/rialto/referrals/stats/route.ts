import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/referrals/stats?customer_id=...
 * Retourne les stats de parrainage pour un client (count par status).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const customerId = url.searchParams.get("customer_id");
  if (!customerId) {
    return NextResponse.json(
      { error: "customer_id requis" },
      { status: 400 },
    );
  }

  const admin = supabaseService();

  const { data: refs } = await admin
    .from("referrals")
    .select("id, status, referee_phone, created_at, rewarded_at, referral_code")
    .eq("referrer_customer_id", customerId)
    .order("created_at", { ascending: false });

  const byStatus = {
    pending: 0,
    claimed: 0,
    rewarded: 0,
    expired: 0,
  } as Record<string, number>;

  for (const r of refs ?? []) {
    const s = (r.status as string) ?? "pending";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }

  // Trouve le code principal (s'il y en a un)
  const mainRef = (refs ?? []).find((r) => r.referee_phone === null && r.status === "pending");

  return NextResponse.json(
    {
      ok: true,
      code: mainRef?.referral_code ?? null,
      totals: byStatus,
      total: (refs ?? []).filter((r) => r.referee_phone !== null).length,
      history: (refs ?? []).filter((r) => r.referee_phone !== null).slice(0, 20),
    },
  );
}
