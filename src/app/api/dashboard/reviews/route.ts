import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/reviews — file de validation du gate avis (RV1b).
 * Liste les requêtes à traiter : manual_pending (le client a signalé
 * « mon avis n'apparaît pas ») en tête, puis pending (suivi), puis les
 * 20 dernières traitées (contexte).
 */

function guard(req: NextRequest): NextResponse | null {
  if (!isDashboardConfigured()) {
    return NextResponse.json(
      { ok: false, error: "dashboard_not_configured" },
      { status: 500 },
    );
  }
  if (!requireDashboardAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const sb = supabaseService();
  const { data, error } = await sb
    .from("review_verification_requests")
    .select(
      "id, customer_id, google_name, status, created_at, last_checked_at, check_count, customers ( first_name, phone )",
    )
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json(
        { ok: false, error: "rv1_non_executee" },
        { status: 503 },
      );
    }
    console.error("[dashboard/reviews] lecture échouée", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Enrichissement : clients détenant DÉJÀ un claim valide — l'UI grise
  // le bouton Valider (l'approve renverrait 409 claim_deja_actif).
  const lignes = (data ?? []) as Array<{ customer_id: string }>;
  const clientIds = [...new Set(lignes.map((r) => r.customer_id))];
  let claimsActifs = new Set<string>();
  if (clientIds.length > 0) {
    const { data: claims } = await sb
      .from("google_review_claims")
      .select("customer_id")
      .in("customer_id", clientIds)
      .gt("expires_at", new Date().toISOString());
    claimsActifs = new Set(
      ((claims ?? []) as Array<{ customer_id: string }>).map(
        (c) => c.customer_id,
      ),
    );
  }

  return NextResponse.json(
    {
      ok: true,
      requests: lignes.map((r) => ({
        ...r,
        claim_actif: claimsActifs.has(r.customer_id),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
