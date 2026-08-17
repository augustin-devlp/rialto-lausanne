import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/menu-item/[id]
 * Retourne les infos d'un item du menu (pour ajout direct au cart depuis
 * l'upsell checkout Phase 11 C12).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = supabaseService();

  // menu_categories(name) : nécessaire au compte de pizzas ETA ET au
  // tracking item_category (refonte 18.08 — un combo ajouté par l'upsell
  // entrait au panier sans catégorie et sortait du palier de cuisine).
  const { data: item, error } = await admin
    .from("menu_items")
    .select(
      "id, name, price, description, is_available, is_out_of_stock, has_options, menu_categories ( name )",
    )
    .eq("id", params.id)
    .eq("restaurant_id", RESTAURANT_ID)
    .maybeSingle();

  if (error) {
    // Embed menu_categories inédit dans ce repo : un échec de résolution
    // PostgREST ne doit JAMAIS passer pour un « article introuvable »
    // silencieux (relecture 18.08).
    console.error("[menu-item] lecture en échec", error);
    return NextResponse.json({ error: "server" }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const categorieRel = (
    item as unknown as {
      menu_categories?: { name?: string | null } | { name?: string | null }[];
    }
  ).menu_categories;
  const categorie = Array.isArray(categorieRel)
    ? (categorieRel[0]?.name ?? null)
    : (categorieRel?.name ?? null);

  return NextResponse.json({
    ok: true,
    item: {
      id: item.id,
      name: item.name,
      price: Number(item.price),
      description: item.description,
      is_available: item.is_available,
      is_out_of_stock: Boolean(
        (item as { is_out_of_stock?: boolean }).is_out_of_stock,
      ),
      has_options: item.has_options,
      category: categorie,
    },
  });
}
