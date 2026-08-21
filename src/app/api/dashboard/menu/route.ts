import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { isDashboardConfigured, requireDashboardAuth } from "@/lib/dashboardAuth";

export const dynamic = "force-dynamic";

/**
 * GET   /api/dashboard/menu           → la carte, groupée par catégorie
 * PATCH /api/dashboard/menu           → bascule disponible/épuisé d'UN article
 * POST  /api/dashboard/menu/tout-remettre  (voir la route sœur)
 *
 * ⚠️ PÉRIMÈTRE VOLONTAIREMENT MINUSCULE (décision Augustin 21.08) :
 * Mehmet peut UNIQUEMENT basculer `is_out_of_stock`. Prix, nom,
 * description, photo, catégorie, allergènes, coup de cœur : JAMAIS
 * modifiables — le menu est en version finale. Le GET les renvoie en
 * lecture seule (nom + prix), le PATCH n'accepte RIEN d'autre que
 * `{ id, is_out_of_stock }`.
 *
 * Objectif produit : retirer un plat en rupture en 3 secondes depuis un
 * téléphone, en plein service, et le remettre aussi vite.
 */

function guard(req: NextRequest): NextResponse | null {
  if (!isDashboardConfigured()) {
    return NextResponse.json(
      { ok: false, error: "dashboard_not_configured" },
      { status: 500 },
    );
  }
  if (!requireDashboardAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const sb = supabaseService();
  const { data, error } = await sb
    .from("menu_items")
    .select(
      "id, name, price, is_out_of_stock, is_available, display_order, menu_categories!inner (id, name, display_order, restaurant_id)",
    )
    .eq("menu_categories.restaurant_id", RESTAURANT_ID)
    .order("display_order", { ascending: true });

  if (error) {
    console.error("[dashboard/menu] lecture échouée", error);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  type Ligne = {
    id: string;
    name: string;
    price: number | string;
    is_out_of_stock: boolean | null;
    is_available: boolean;
    display_order: number | null;
    menu_categories:
      | { id: string; name: string; display_order: number | null }
      | { id: string; name: string; display_order: number | null }[];
  };

  const articles = ((data ?? []) as unknown as Ligne[]).map((r) => {
    const cat = Array.isArray(r.menu_categories)
      ? r.menu_categories[0]
      : r.menu_categories;
    return {
      id: r.id,
      nom: r.name,
      prix: Number(r.price),
      // `is_out_of_stock` est NULLABLE en base : on normalise ici pour que
      // l'écran ne raisonne jamais sur un troisième état.
      epuise: r.is_out_of_stock === true || r.is_available === false,
      categorie: cat?.name ?? "Autres",
      ordre_categorie: cat?.display_order ?? 999,
      ordre: r.display_order ?? 999,
    };
  });

  articles.sort(
    (a, b) =>
      a.ordre_categorie - b.ordre_categorie ||
      a.ordre - b.ordre ||
      a.nom.localeCompare(b.nom, "fr"),
  );

  return NextResponse.json(
    {
      ok: true,
      articles,
      nb_epuises: articles.filter((a) => a.epuise).length,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    id?: unknown;
    is_out_of_stock?: unknown;
  } | null;

  // Validation STRICTE : refuser plutôt que corriger en silence. Le body
  // ne peut porter QUE ces deux champs — tout le reste du menu est figé.
  if (!body || typeof body.id !== "string" || body.id.length < 10) {
    return NextResponse.json({ ok: false, error: "id_invalide" }, { status: 400 });
  }
  if (typeof body.is_out_of_stock !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "is_out_of_stock_invalide" },
      { status: 400 },
    );
  }

  const sb = supabaseService();

  // ⚠️ Le scope restaurant passe par la CATÉGORIE (menu_items n'a pas de
  // restaurant_id propre) : sans lui, un id forgé écrirait sur le menu
  // d'un autre restaurant de la base.
  const { data: article, error: erreurLecture } = await sb
    .from("menu_items")
    .select("id, name, menu_categories!inner (restaurant_id)")
    .eq("id", body.id)
    .eq("menu_categories.restaurant_id", RESTAURANT_ID)
    .maybeSingle();

  if (erreurLecture) {
    console.error("[dashboard/menu] vérification échouée", erreurLecture);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }
  if (!article) {
    return NextResponse.json({ ok: false, error: "introuvable" }, { status: 404 });
  }

  const epuise = body.is_out_of_stock;
  const { data: maj, error } = await sb
    .from("menu_items")
    .update({
      is_out_of_stock: epuise,
      // Horodatage tenu à jour : la colonne existait mais rien ne
      // l'entretenait (elle datait du seed d'avril). Elle n'est lue par
      // aucun écran aujourd'hui — on la garde honnête plutôt que de la
      // laisser mentir.
      out_of_stock_since: epuise ? new Date().toISOString() : null,
      // Le motif n'est PAS saisissable (le cadrage exclut tout champ de
      // texte) : on le nettoie au retour en stock pour ne pas laisser
      // traîner un motif périmé.
      out_of_stock_reason: epuise ? "Retiré depuis le dashboard" : null,
      out_of_stock_auto_reactivate_at: null,
    })
    .eq("id", body.id)
    .select("id, name, is_out_of_stock")
    .maybeSingle();

  if (error || !maj) {
    console.error("[dashboard/menu] écriture échouée", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    id: maj.id,
    nom: maj.name,
    epuise: maj.is_out_of_stock === true,
  });
}
