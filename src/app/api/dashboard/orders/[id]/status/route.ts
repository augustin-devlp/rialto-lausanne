import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/orders/[id]/status — changement de statut par le patron.
 * Body : { status: OrderStatus, reason?: string }.
 *
 * Transitions autorisées (avant = clés, après = valeurs) :
 *   new       → accepted | cancelled
 *   accepted  → preparing | cancelled
 *   preparing → ready | cancelled
 *   ready     → completed | cancelled
 * (completed / cancelled : terminaux — aucun retour en arrière v1)
 *
 * Le refus (cancelled) exige un motif (reason) — stocké dans
 * orders.cancellation_reason. ⚠️ NOTE INTERNE : ne part jamais vers le
 * client via ce repo (vérifié) ; la conv caisse est prévenue du risque
 * template SMS order_cancelled côté legacy.
 *
 * Journalisation : le trigger DB loggue le changement ; on ajoute EN PLUS
 * la ligne applicative avec changed_by='dashboard' (le trigger ne
 * renseigne l'email que pour un JWT authenticated — service_role → NULL).
 */

const ALLOWED: Record<string, string[]> = {
  new: ["accepted", "cancelled"],
  accepted: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
};

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
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

  const body = (await req.json().catch(() => null)) as {
    status?: string;
    reason?: string;
  } | null;
  const nextStatus = body?.status;
  const reason = body?.reason?.trim() || null;

  if (!nextStatus) {
    return NextResponse.json(
      { ok: false, error: "status_requis" },
      { status: 400 },
    );
  }
  if (nextStatus === "cancelled" && !reason) {
    return NextResponse.json(
      { ok: false, error: "motif_requis" },
      { status: 400 },
    );
  }

  const sb = supabaseService();

  const { data: current, error: readErr } = await sb
    .from("orders")
    .select("id, status")
    .eq("id", params.id)
    .eq("restaurant_id", RESTAURANT_ID)
    .single();

  if (readErr || !current) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  const allowed = ALLOWED[current.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    return NextResponse.json(
      {
        ok: false,
        error: "transition_invalide",
        detail: `${current.status} → ${nextStatus} non autorisé`,
      },
      { status: 409 },
    );
  }

  const { error: upErr } = await sb
    .from("orders")
    .update({
      status: nextStatus,
      ...(nextStatus === "cancelled" ? { cancellation_reason: reason } : {}),
    })
    .eq("id", params.id)
    .eq("restaurant_id", RESTAURANT_ID)
    // Garde anti-course : ne passe que si le statut n'a pas bougé entre
    // notre lecture et l'update (la caisse peut agir en parallèle).
    .eq("status", current.status);

  if (upErr) {
    console.error("[dashboard/status] update failed", upErr);
    return NextResponse.json(
      { ok: false, error: "update_failed" },
      { status: 500 },
    );
  }

  // Ligne applicative d'audit avec l'auteur (en plus de celle du trigger).
  await sb.from("order_status_history").insert({
    order_id: params.id,
    old_status: current.status,
    new_status: nextStatus,
    changed_by: "dashboard",
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
