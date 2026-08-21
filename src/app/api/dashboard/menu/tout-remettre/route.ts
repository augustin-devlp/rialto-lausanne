import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { isDashboardConfigured, requireDashboardAuth } from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/menu/tout-remettre
 *
 * « Tout remettre disponible » — le geste du lendemain matin : rouvrir la
 * carte d'un coup au lieu de huit bascules (décision Augustin 21.08).
 *
 * ⚠️ Ne touche QUE `is_out_of_stock`. Ne remet JAMAIS `is_available` à
 * true : cette colonne est un interrupteur de fond, hors du périmètre de
 * l'écran (et vaut `true` sur les 121 articles aujourd'hui). Les
 * confondre ferait ressurgir un plat volontairement retiré du catalogue.
 */
export async function POST(req: NextRequest) {
  if (!isDashboardConfigured()) {
    return NextResponse.json(
      { ok: false, error: "dashboard_not_configured" },
      { status: 500 },
    );
  }
  if (!requireDashboardAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = supabaseService();

  // Les ids du restaurant, scopés sur les DEUX clés : `restaurant_id` (celle
  // du site client) ET la catégorie. Une remise en vente de masse ne doit
  // jamais pouvoir déborder sur le menu d'un autre restaurant de la base.
  const { data: articles, error: erreurLecture } = await sb
    .from("menu_items")
    .select("id, menu_categories!inner (restaurant_id)")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("menu_categories.restaurant_id", RESTAURANT_ID)
    .eq("is_out_of_stock", true);

  if (erreurLecture) {
    console.error("[dashboard/menu/tout-remettre] lecture échouée", erreurLecture);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const ids = (articles ?? []).map((a) => a.id as string);
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, remis: 0 });
  }

  const { data: maj, error } = await sb
    .from("menu_items")
    .update({
      is_out_of_stock: false,
      out_of_stock_since: null,
      out_of_stock_reason: null,
      out_of_stock_auto_reactivate_at: null,
    })
    .in("id", ids)
    .select("id");

  if (error) {
    console.error("[dashboard/menu/tout-remettre] écriture échouée", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, remis: (maj ?? []).length });
}
