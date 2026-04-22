import { notFound } from "next/navigation";
import { supabaseServer, RESTAURANT_ID } from "@/lib/supabase";
import type { MenuItem, MenuItemOption } from "@/lib/types";
import { idSuffixFromSlug } from "@/lib/slug";
import { matchDishImage } from "@/lib/rialto-data";
import ProductPageClient from "./ProductPageClient";

export const revalidate = 120;

type EnrichedItem = MenuItem & {
  is_gluten_free?: boolean | null;
  is_vegan?: boolean | null;
  is_lactose_free?: boolean | null;
  is_halal?: boolean | null;
  is_kids_friendly?: boolean | null;
  ingredients?: string[] | null;
  allergens?: string[] | null;
  description_long?: string | null;
  tags?: string[] | null;
  category_name?: string | null;
};

async function loadProduct(slug: string) {
  const idSuffix = idSuffixFromSlug(slug);
  if (!idSuffix) return null;

  const sb = supabaseServer();

  // Chercher par ID : le slug se termine par les 8 premiers chars de l'UUID
  // sans tirets. On reconstitue un filtre Postgres.
  // Approche simple : charger tous les items du restaurant et matcher côté
  // Node. Menu Rialto = ~120 items, pas critique.
  const { data: items } = await sb
    .from("menu_items")
    .select(
      `
      id, category_id, name, description, price, image_url, is_available,
      is_vegetarian, is_spicy, is_gluten_free, is_vegan, is_lactose_free,
      is_halal, is_kids_friendly, has_options, display_order,
      tags, ingredients, allergens, description_long
      `,
    )
    .eq("restaurant_id", RESTAURANT_ID)
    .order("display_order");

  if (!items) return null;

  const match = items.find((it) => {
    const stripped = (it.id as string).replace(/-/g, "");
    return stripped.startsWith(idSuffix);
  });
  if (!match) return null;

  // Charge la catégorie pour le breadcrumb
  const { data: category } = await sb
    .from("menu_categories")
    .select("id, name")
    .eq("id", match.category_id)
    .maybeSingle();

  // Charge les options
  const { data: options } = await sb
    .from("menu_item_options")
    .select(
      "id, item_id, option_group, option_name, extra_price, is_required, max_selections, display_order",
    )
    .eq("item_id", match.id)
    .order("display_order");

  const enriched: EnrichedItem = {
    ...(match as EnrichedItem),
    category_name: (category?.name as string) ?? null,
  };

  return {
    item: enriched,
    options: (options ?? []) as MenuItemOption[],
  };
}

export async function generateMetadata({
  params,
}: {
  params: { productSlug: string };
}) {
  const data = await loadProduct(params.productSlug);
  if (!data) return { title: "Produit introuvable · Rialto" };
  const { item } = data;
  const image = item.image_url || matchDishImage(item.name, item.category_name);
  const desc = (item.description ?? "").slice(0, 160);
  return {
    title: `${item.name} · Rialto`,
    description: desc,
    openGraph: {
      title: item.name,
      description: desc,
      images: [{ url: image, alt: item.name }],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: { productSlug: string };
}) {
  const data = await loadProduct(params.productSlug);
  if (!data) return notFound();

  // JSON-LD schema.org MenuItem pour le SEO
  const image =
    data.item.image_url ||
    matchDishImage(data.item.name, data.item.category_name);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "MenuItem",
    name: data.item.name,
    description: data.item.description_long ?? data.item.description ?? "",
    image: [image],
    offers: {
      "@type": "Offer",
      priceCurrency: "CHF",
      price: Number(data.item.price).toFixed(2),
    },
    ...(data.item.is_vegetarian
      ? { suitableForDiet: "https://schema.org/VegetarianDiet" }
      : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ProductPageClient item={data.item} options={data.options} />
    </>
  );
}
