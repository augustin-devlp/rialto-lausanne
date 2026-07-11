import { supabaseService, RESTAURANT_ID } from '@/lib/supabase';
import type { MenuItemFull } from './types';

/**
 * Charge tout le menu Rialto avec la taxonomie upsell.
 * Cache 30s en-process pour éviter de hammer la DB à chaque debounce panier.
 */
let cache: { items: MenuItemFull[]; expiresAt: number } | null = null;
const CACHE_TTL_MS = 30_000;

export async function fetchFullMenu(): Promise<MenuItemFull[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.items;

  const admin = supabaseService();
  const { data, error } = await admin
    .from('menu_items')
    .select(
      `id, name, price, image_url, is_available, is_out_of_stock, category_id,
       heat_level, richness_level, saltiness_level, sweetness_level, acidity_level,
       caloric_density, fat_level, dish_role, cuisine_style, main_ingredient,
       is_vegetarian, contains_pork, contains_alcohol, serves_pax, is_shareable,
       ideal_time_of_day, upsell_tags, pairs_well_with_ids, avoid_with_ids, semantic_tags`,
    )
    .eq('restaurant_id', RESTAURANT_ID);

  if (error) {
    console.error('[upsell/menu] fetch failed', error.message);
    return [];
  }

  const items = (data ?? []).map((r) => ({
    id: r.id as string,
    name: (r.name as string) ?? '',
    price: Number(r.price ?? 0),
    image_url: (r.image_url as string) ?? undefined,
    is_available: r.is_available !== false,
    is_out_of_stock: Boolean(r.is_out_of_stock),
    category_id: (r.category_id as string) ?? '',
    heat_level: Number(r.heat_level ?? 0),
    richness_level: Number(r.richness_level ?? 2),
    saltiness_level: Number(r.saltiness_level ?? 2),
    sweetness_level: Number(r.sweetness_level ?? 1),
    acidity_level: Number(r.acidity_level ?? 2),
    caloric_density: Number(r.caloric_density ?? 2),
    fat_level: Number(r.fat_level ?? 2),
    dish_role: (r.dish_role as MenuItemFull['dish_role']) ?? 'main',
    cuisine_style: (r.cuisine_style as MenuItemFull['cuisine_style']) ?? 'universal',
    main_ingredient: (r.main_ingredient as string) ?? 'none',
    is_vegetarian: Boolean(r.is_vegetarian),
    contains_pork: Boolean(r.contains_pork),
    contains_alcohol: Boolean(r.contains_alcohol),
    serves_pax: Number(r.serves_pax ?? 1),
    is_shareable: Boolean(r.is_shareable),
    ideal_time_of_day: (r.ideal_time_of_day as string[]) ?? [],
    upsell_tags: (r.upsell_tags as string[]) ?? [],
    pairs_well_with_ids: (r.pairs_well_with_ids as string[]) ?? [],
    avoid_with_ids: (r.avoid_with_ids as string[]) ?? [],
    semantic_tags: (r.semantic_tags as string[]) ?? [],
  })) as MenuItemFull[];

  cache = { items, expiresAt: Date.now() + CACHE_TTL_MS };
  return items;
}
