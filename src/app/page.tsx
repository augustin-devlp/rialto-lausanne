import { supabaseServer, RESTAURANT_ID } from "@/lib/supabase";
import type {
  Restaurant,
  MenuCategory,
  MenuItem,
  MenuItemOption,
} from "@/lib/types";
import MenuView from "@/components/MenuView";

export const revalidate = 60;

async function loadData() {
  const sb = supabaseServer();

  const { data: restaurant } = await sb
    .from("restaurants")
    .select(
      "id, slug, name, address, phone, logo_url, order_min_amount, order_open_time, order_close_time, prep_time_minutes, accepting_orders",
    )
    .eq("id", RESTAURANT_ID)
    .single();

  const { data: categories } = await sb
    .from("menu_categories")
    .select("id, name, display_order, icon")
    .eq("restaurant_id", RESTAURANT_ID)
    .order("display_order");

  const { data: items } = await sb
    .from("menu_items")
    .select(
      "id, category_id, name, description, price, image_url, is_available, is_vegetarian, is_spicy, has_options, display_order",
    )
    .eq("restaurant_id", RESTAURANT_ID)
    .order("display_order");

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
    restaurant: restaurant as Restaurant | null,
    categories: (categories ?? []) as MenuCategory[],
    items: (items ?? []) as MenuItem[],
    options: (options ?? []) as MenuItemOption[],
  };
}

export default async function HomePage() {
  const { restaurant, categories, items, options } = await loadData();

  if (!restaurant) {
    return (
      <main className="flex min-h-screen items-center justify-center p-10">
        <p className="text-mute">Restaurant introuvable.</p>
      </main>
    );
  }

  return (
    <MenuView
      restaurant={restaurant}
      categories={categories}
      items={items}
      options={options}
    />
  );
}
