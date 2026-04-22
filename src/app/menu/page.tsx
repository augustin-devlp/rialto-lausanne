import { supabaseServer, RESTAURANT_ID } from "@/lib/supabase";
import type {
  MenuCategory,
  MenuItem,
  MenuItemOption,
} from "@/lib/types";
import MenuClient from "@/components/menu-v2/MenuClient";

export const revalidate = 120;

async function loadMenu() {
  const sb = supabaseServer();

  const [{ data: categories }, { data: items }] = await Promise.all([
    sb
      .from("menu_categories")
      .select("id, name, display_order, icon")
      .eq("restaurant_id", RESTAURANT_ID)
      .order("display_order"),
    sb
      .from("menu_items")
      .select(
        "id, category_id, name, description, price, image_url, is_available, is_vegetarian, is_spicy, is_gluten_free, is_vegan, is_lactose_free, is_halal, is_kids_friendly, tags, allergens, has_options, display_order",
      )
      .eq("restaurant_id", RESTAURANT_ID)
      .order("display_order"),
  ]);

  const itemIds = (items ?? []).map((i) => i.id);
  const { data: options } = itemIds.length
    ? await sb
        .from("menu_item_options")
        .select(
          "id, item_id, option_group, option_name, extra_price, is_required, max_selections, display_order",
        )
        .in("item_id", itemIds)
        .order("display_order")
    : { data: [] as MenuItemOption[] };

  return {
    categories: (categories ?? []) as MenuCategory[],
    items: (items ?? []) as MenuItem[],
    options: (options ?? []) as MenuItemOption[],
  };
}

export default async function MenuPage() {
  const { categories, items, options } = await loadMenu();
  return <MenuClient categories={categories} items={items} options={options} />;
}
