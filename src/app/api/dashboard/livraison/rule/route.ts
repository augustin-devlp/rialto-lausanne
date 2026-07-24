import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { toFreeDeliveryRule } from "@/lib/delivery/rule";

export const dynamic = "force-dynamic";

/**
 * GET/PATCH /api/dashboard/livraison/rule — réglage « livraison offerte à
 * partir d'un seuil » (LS1). Colonnes portées par `restaurants` (LS0).
 *
 * Contrairement au barème fidélité, PAS de garde anti-rétroactivité : les
 * frais sont figés à la création de chaque commande (POST /api/orders) —
 * changer le seuil ne touche jamais une commande existante, seulement les
 * suivantes.
 *
 * Le GET renvoie aussi `floor_reference` = le plus petit min_order_amount
 * des zones de livraison actives : c'est le plancher naturel du seuil. En
 * dessous, TOUTE commande livrée devient gratuite en frais — le dashboard
 * affiche un avertissement (point 2 de la review navette LS0), le PATCH ne
 * bloque pas : le restaurateur tranche.
 */

const SELECT_COLS = "free_delivery_threshold, free_delivery_enabled";

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

async function floorReference(
  sb: ReturnType<typeof supabaseService>,
): Promise<number | null> {
  const { data } = await sb
    .from("delivery_zones")
    .select("min_order_amount")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("is_active", true);
  const mins = ((data as Array<{ min_order_amount: number | string }> | null) ?? [])
    .map((z) => Number(z.min_order_amount))
    .filter((n) => Number.isFinite(n));
  return mins.length > 0 ? Math.min(...mins) : null;
}

export async function GET(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const sb = supabaseService();
  const { data, error } = await sb
    .from("restaurants")
    .select(SELECT_COLS)
    .eq("id", RESTAURANT_ID)
    .maybeSingle();

  if (error || !data) {
    console.error("[dashboard/livraison/rule] lecture échouée", error);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      rule: toFreeDeliveryRule(data as Record<string, unknown>),
      floor_reference: await floorReference(sb),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    threshold?: number | string;
    enabled?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "body_invalide" }, { status: 400 });
  }

  // Validation stricte : on refuse plutôt que de corriger silencieusement.
  const threshold = Number(body.threshold);
  // Plancher 1 CHF (cohérent avec le CHECK > 0 en base) et plafond de bon
  // sens : au-delà de 1000 CHF le seuil est inatteignable, c'est une faute
  // de frappe.
  if (!Number.isFinite(threshold) || threshold < 1 || threshold > 1000) {
    return NextResponse.json({ ok: false, error: "seuil_invalide" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "enabled_invalide" }, { status: 400 });
  }

  const sb = supabaseService();
  const { data, error } = await sb
    .from("restaurants")
    .update({
      free_delivery_threshold: threshold,
      free_delivery_enabled: body.enabled,
    })
    .eq("id", RESTAURANT_ID)
    .select(SELECT_COLS)
    .maybeSingle();

  if (error || !data) {
    console.error("[dashboard/livraison/rule] écriture échouée", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    rule: toFreeDeliveryRule(data as Record<string, unknown>),
    floor_reference: await floorReference(sb),
  });
}
