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
  // Le scope passe par les DEUX clés. `menu_items.restaurant_id` est celle
  // qu'emploie tout le site client (menu/page.tsx, [productSlug]/page.tsx,
  // api/orders) ; le filtre par catégorie sert en plus au tri. Les filtrer
  // séparément reviendrait à décrire DEUX ensembles : un plat rattaché à la
  // catégorie d'un autre restaurant serait vendu par le site et absent de
  // cet écran — invisible pour Mehmet, donc impossible à retirer.
  const { data, error } = await sb
    .from("menu_items")
    .select(
      "id, name, price, is_out_of_stock, is_available, display_order, menu_categories!inner (id, name, display_order, restaurant_id)",
    )
    .eq("restaurant_id", RESTAURANT_ID)
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

  // Validation STRICTE : refuser plutôt que corriger en silence. Le body ne
  // peut porter QUE ces deux champs — et on le VÉRIFIE, au lieu de se
  // contenter de l'écrire en commentaire : un appelant qui envoie `price` ou
  // `name` se trompe sur ce que fait cette route, et doit l'apprendre par un
  // refus. (L'`update` plus bas est un littéral, donc rien ne passerait de
  // toute façon — mais une garantie écrite doit être tenue par du code.)
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "body_invalide" }, { status: 400 });
  }
  const clesEnTrop = Object.keys(body).filter(
    (k) => k !== "id" && k !== "is_out_of_stock",
  );
  if (clesEnTrop.length > 0) {
    return NextResponse.json(
      { ok: false, error: "champs_interdits", champs: clesEnTrop },
      { status: 400 },
    );
  }
  // Format UUID : sans ce test, un id court mais non-uuid atteint Postgres
  // et ressort en 22P02 → 500 bruyant au lieu d'un 400 franc.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (typeof body.id !== "string" || !UUID.test(body.id)) {
    return NextResponse.json({ ok: false, error: "id_invalide" }, { status: 400 });
  }
  if (typeof body.is_out_of_stock !== "boolean") {
    return NextResponse.json(
      { ok: false, error: "is_out_of_stock_invalide" },
      { status: 400 },
    );
  }

  const sb = supabaseService();

  // ⚠️ Le scope restaurant est vérifié AVANT l'écriture, sur les DEUX clés :
  // `menu_items.restaurant_id` (celle du site client) ET la catégorie. Sans
  // ce contrôle, un id forgé écrirait sur le menu d'un autre restaurant.
  const { data: article, error: erreurLecture } = await sb
    .from("menu_items")
    .select("id, name, menu_categories!inner (restaurant_id)")
    .eq("id", body.id)
    .eq("restaurant_id", RESTAURANT_ID)
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
      // ⚠️ Cette colonne part dans la charge utile de la page PUBLIQUE
      // (`/menu` la sélectionne). Rien ne l'affiche aujourd'hui, mais son
      // nom invite à le faire : le libellé doit donc être lisible par un
      // client, jamais du jargon interne.
      out_of_stock_reason: epuise ? "Épuisé aujourd'hui" : null,
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
