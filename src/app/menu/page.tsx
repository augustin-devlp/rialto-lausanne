import { supabaseServer, RESTAURANT_ID } from "@/lib/supabase";
import type {
  MenuCategory,
  MenuItem,
  MenuItemOption,
} from "@/lib/types";
import MenuClient from "@/components/menu-v2/MenuClient";
import { COLLECTIONS, idsOrphelins } from "@/lib/menu/collections";
import { jourDeService, slugsFantomes } from "@/lib/menu/rotation";
import { toZurichDate } from "@/lib/timezone";

// Rendu dynamique : connexion Supabase au runtime (jamais au build, évite
// "supabaseUrl is required"). Bonus : badges Coup de cœur / Épuisé / Saison
// toujours à jour dès que le merchant toggle un plat, sans cache.
export const dynamic = "force-dynamic";

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
        "id, category_id, name, description, price, image_url, is_available, is_out_of_stock, out_of_stock_reason, is_seasonal, season_start, season_end, is_priority, similar_to, is_vegetarian, is_spicy, is_gluten_free, is_vegan, is_lactose_free, is_halal, is_kids_friendly, tags, allergens, has_options, display_order",
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

  // Garde d'intégrité des 12 rails : leurs ids sont des clés étrangères SANS
  // contrainte en base. Un article supprimé/recréé laisse un id orphelin et
  // sa carte disparaît du rail sans que personne ne le sache. On journalise
  // côté serveur plutôt que d'avaler l'oubli. Contrôlé sur le catalogue
  // BRUT (avant tout filtre) : « absent du catalogue » ≠ « filtré ».
  const orphelins = idsOrphelins((items ?? []) as MenuItem[]);
  if (orphelins.length > 0) {
    console.error(
      `[menu/rails] ${orphelins.length} id(s) de collection introuvable(s) au catalogue :`,
      orphelins.join(", "),
    );
  }

  // Garde d'intégrité de la ROTATION : un slug mal orthographié dans les
  // paires ferait disparaître un rail un jour sur six, en silence.
  const rot = slugsFantomes(COLLECTIONS.map((c) => c.slug));
  if (rot.fantomes.length || rot.doublons.length || rot.jamaisAffiches.length) {
    console.error(
      "[menu/rotation] cycle incohérent —",
      "slugs inexistants:", rot.fantomes.join(", ") || "aucun",
      "| jamais affichés:", rot.jamaisAffiches.join(", ") || "aucun",
      "| en double:", rot.doublons.join(", ") || "aucun",
    );
  }

  return {
    categories: (categories ?? []) as MenuCategory[],
    items: (items ?? []) as MenuItem[],
    options: (options ?? []) as MenuItemOption[],
  };
}

export default async function MenuPage() {
  const { categories, items, options } = await loadMenu();

  // ⚠️ LES DEUX DATES VIENNENT DU SERVEUR, JAMAIS DU NAVIGATEUR.
  // Le client calculait sa date avec `new Date().toISOString()` — soit
  // l'heure UTC de l'appareil. Deux défauts en une ligne : en été Zurich est
  // à UTC+2, donc entre minuit et 02h00 la date UTC est encore celle de la
  // veille ; et un téléphone mal réglé filtrait faux. Une seule horloge, ici.
  //
  // Deux notions DISTINCTES, à ne pas confondre :
  //   · jourCalendaire — la vraie date Zurich, pour la SAISON d'un plat
  //     (une fenêtre de saison est calendaire ; c'est aussi ce que fait le
  //     serveur dans deriveOrderPricing, on reste cohérent).
  //   · jourService — frontière à 05:00, pour la ROTATION des carrousels
  //     (même frontière que la clôture CL1 : un client qui commande à 00h30
  //     est encore dans le service de la veille).
  const maintenant = new Date();
  return (
    <MenuClient
      categories={categories}
      items={items}
      options={options}
      restaurantId={RESTAURANT_ID}
      jourCalendaire={toZurichDate(maintenant)}
      jourService={jourDeService(maintenant)}
    />
  );
}
