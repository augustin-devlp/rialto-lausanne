import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { phoneLookupVariants } from "@/lib/phoneVariants";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/orders/[orderNumber]/reorder
 *
 * Phase 11 C7 — Retourne les items d'une ancienne commande Rialto dans
 * le format CartItem attendu par le client, pour "Recommander en 1 clic".
 *
 * Les items absents du menu actuel (plats retirés) sont filtrés —
 * on indique unavailable_count en response pour un feedback UX.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { orderNumber: string } },
) {
  // ⚠️ CONTRÔLE DU PROPRIÉTAIRE PAR TÉLÉPHONE — comme la route sœur
  // `detail`, et NON par jeton (revirement du 21.08, second passage).
  //
  // Cette route n'avait AUCUN contrôle : le numéro de commande — séquentiel
  // — suffisait à obtenir le panier complet, NOTES LIBRES DU CLIENT
  // COMPRISES. Je l'ai d'abord fermée par jeton, en écrivant que « le
  // téléphone ne prouve rien ici, puisque c'est précisément ce que la page
  // publiait ». Cet argument est MORT le jour même : la page de
  // confirmation est fermée, elle ne publie plus rien. La circularité a
  // disparu, donc le téléphone redevient une preuve valable — et il évite
  // de faire transiter le jeton par une route ouverte, ce qui était le vrai
  // problème.
  //
  // Niveau d'exposition identique à `detail`, qui suit la même règle :
  // des noms de plats et les notes du client, jamais un montant.
  const phone = new URL(req.url).searchParams.get("phone")?.trim();
  if (!phone) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const admin = supabaseService();

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, status, customer_id")
    .eq("order_number", params.orderNumber)
    .eq("restaurant_id", RESTAURANT_ID)
    .maybeSingle();

  if (!order || !order.customer_id) {
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  // Le téléphone doit désigner LE client de cette commande. Comparaison sur
  // les VARIANTES, jamais en égalité brute : la base est historiquement
  // mixte (+41…, 41…, 07…). Une égalité brute donnerait un 404 permanent à
  // tout client dont la session porte un autre format — même piège que
  // `detail`, déjà corrigé là-bas.
  const variantes = phoneLookupVariants(phone).variants;
  const { data: proprietaire } = await admin
    .from("customers")
    .select("id")
    .eq("id", order.customer_id)
    .in("phone", variantes.length > 0 ? variantes : [phone])
    .maybeSingle();
  if (!proprietaire) {
    // 404 et non 403 : ne pas confirmer qu'un numéro deviné existe.
    return NextResponse.json({ error: "order_not_found" }, { status: 404 });
  }

  const { data: items } = await admin
    .from("order_items")
    .select(
      "menu_item_id, item_name_snapshot, item_price_snapshot, quantity, selected_options, notes",
    )
    .eq("order_id", order.id);

  if (!items || items.length === 0) {
    return NextResponse.json({ ok: true, cart_items: [], unavailable_count: 0 });
  }

  // Verify menu items still exist and get their current price
  const ids = items.map((i) => i.menu_item_id).filter(Boolean) as string[];
  // category : nécessaire au compte de pizzas du moteur ETA (refonte
  // 18.08 — une re-commande sans catégories passait pour « zéro pizza »
  // et sous-promettait de 20+ min).
  const { data: menuItems, error: erreurMenu } = await admin
    .from("menu_items")
    .select("id, name, price, is_available, menu_categories ( name )")
    .in("id", ids);
  if (erreurMenu) {
    // Sans cette garde, un échec de l'embed classait TOUS les articles
    // « indisponibles » et le client lisait un message métier FAUX
    // (« aucun des plats n'est plus disponible ») — relecture 18.08.
    console.error("[reorder] lecture menu en échec", erreurMenu);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const availableMap = new Map(
    (menuItems ?? []).map((m) => [m.id as string, m]),
  );

  type CartItemDTO = {
    key: string;
    menu_item_id: string;
    name: string;
    base_price: number;
    quantity: number;
    options: Array<{ group: string; name: string; extra_price: number }>;
    notes: string;
    unit_price: number;
    subtotal: number;
    category: string | null;
  };

  const cartItems: CartItemDTO[] = [];
  let unavailable = 0;

  for (const it of items) {
    const menuItem = availableMap.get(it.menu_item_id as string);
    if (!menuItem || menuItem.is_available === false) {
      unavailable += 1;
      continue;
    }
    const options = Array.isArray(it.selected_options)
      ? (it.selected_options as Array<{
          group?: string;
          name?: string;
          extra_price?: number;
        }>).map((o) => ({
          group: o.group ?? "",
          name: o.name ?? "",
          extra_price: Number(o.extra_price ?? 0),
        }))
      : [];
    const basePrice = Number(menuItem.price ?? it.item_price_snapshot ?? 0);
    const extraSum = options.reduce((s, o) => s + Number(o.extra_price ?? 0), 0);
    const unitPrice = basePrice + extraSum;
    const key = `${it.menu_item_id}::${options
      .map((o) => `${o.group}:${o.name}`)
      .sort()
      .join("|")}::${it.notes ?? ""}`;
    const categorieRel = (
      menuItem as unknown as {
        menu_categories?: { name?: string | null } | { name?: string | null }[];
      }
    ).menu_categories;
    const categorie = Array.isArray(categorieRel)
      ? (categorieRel[0]?.name ?? null)
      : (categorieRel?.name ?? null);
    cartItems.push({
      key,
      menu_item_id: it.menu_item_id as string,
      name: (menuItem.name as string) ?? (it.item_name_snapshot as string),
      base_price: basePrice,
      quantity: Number(it.quantity ?? 1),
      options,
      notes: (it.notes as string) ?? "",
      unit_price: unitPrice,
      subtotal: unitPrice * Number(it.quantity ?? 1),
      category: categorie,
    });
  }

  return NextResponse.json({
    ok: true,
    order_number: order.order_number,
    cart_items: cartItems,
    unavailable_count: unavailable,
  });
}
