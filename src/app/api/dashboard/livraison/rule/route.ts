import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { toFreeDeliveryRule } from "@/lib/delivery/rule";

export const dynamic = "force-dynamic";

/**
 * GET/PATCH /api/dashboard/livraison/rule — réglage « livraison offerte »
 * (LS1, refonte PAR ZONE 18.08.2026, chantier zones décision 2).
 *
 * Le restaurateur règle DEUX choses : l'interrupteur maître (enabled) et
 * l'OFFSET au-dessus du minimum de zone (la colonne
 * restaurants.free_delivery_threshold, recyclée). Le seuil effectif de
 * chaque zone = min_order_amount + offset : la grille (A dès 40, B dès
 * 50, C dès 60, D dès 70 avec l'offset 15) suit les minimums
 * automatiquement.
 *
 * Contrairement au barème fidélité, PAS de garde anti-rétroactivité : les
 * frais sont figés à la création de chaque commande (POST /api/orders) —
 * changer l'offset ne touche jamais une commande existante, seulement les
 * suivantes.
 *
 * Le GET renvoie aussi `grille_apercu` : les profils (min → seuil) des
 * zones actives, pour que le dashboard montre l'effet concret de
 * l'offset (remplace l'ancien floor_reference, devenu sans objet : le
 * seuil ne peut plus passer SOUS un minimum de zone par construction).
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

/** Profils distincts (min, fee>0) des zones actives, triés — l'aperçu de
 * la grille dérivée. Les zones à frais nul (Chailly) sont exclues : rien
 * à offrir chez elles. */
async function grilleApercu(
  sb: ReturnType<typeof supabaseService>,
): Promise<Array<{ min_order_amount: number }>> {
  const { data } = await sb
    .from("delivery_zones")
    .select("min_order_amount, delivery_fee")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("is_active", true);
  const mins = new Set<number>();
  for (const z of (data ??
    []) as Array<{ min_order_amount: unknown; delivery_fee: unknown }>) {
    const min = Number(z.min_order_amount);
    const fee = Number(z.delivery_fee);
    if (Number.isFinite(min) && Number.isFinite(fee) && fee > 0) {
      mins.add(min);
    }
  }
  return [...mins].sort((a, b) => a - b).map((m) => ({ min_order_amount: m }));
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
      grille_apercu: await grilleApercu(sb),
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    offset?: number | string;
    enabled?: boolean;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "body_invalide" }, { status: 400 });
  }

  // Validation stricte : on refuse plutôt que de corriger silencieusement.
  const offset = Number(body.offset);
  // Plancher 1 CHF (cohérent avec le CHECK > 0 en base) et plafond de bon
  // sens : un offset au-delà de 100 CHF rendrait la gratuité inatteignable
  // partout — c'est une faute de frappe.
  if (!Number.isFinite(offset) || offset < 1 || offset > 100) {
    return NextResponse.json({ ok: false, error: "offset_invalide" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "enabled_invalide" }, { status: 400 });
  }

  const sb = supabaseService();
  const { data, error } = await sb
    .from("restaurants")
    .update({
      free_delivery_threshold: offset,
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
    grille_apercu: await grilleApercu(sb),
  });
}
