import { notFound } from "next/navigation";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import ConfirmationClient from "@/components/checkout/ConfirmationClient";
import { intrantsPourCommande } from "@/lib/eta/server";
import { PARAM_JETON, verifyOrderToken } from "@/lib/orderAccess";

export const dynamic = "force-dynamic";

async function loadOrder(orderNumber: string, jeton: string | undefined) {
  // ⚠️ LA GARDE VIT ICI, DANS LA FONCTION DE CHARGEMENT, ET AVANT LE SELECT.
  // Deux raisons, dans cet ordre :
  //   1. règle d'office du 21.08 (CLAUDE.md) — une garde qui protège une
  //      règle métier vit dans la fonction, jamais chez celui qui l'appelle.
  //      Placée dans le composant, un futur appelant de loadOrder l'oublie.
  //   2. le jeton se vérifie sans toucher la base : un lien forgé ne coûte
  //      donc pas une requête Supabase, et l'énumération ne charge rien.
  // Le refus est un notFound() — jamais un 403, qui confirmerait qu'un
  // numéro deviné correspond à une vraie commande.
  if (!verifyOrderToken(RESTAURANT_ID, orderNumber, jeton)) return null;

  const sb = supabaseService();
  const { data: order } = await sb
    .from("orders")
    .select(
      // ⚠️ CETTE PAGE EST PUBLIQUE ET SES NUMÉROS SONT SÉQUENTIELS.
      // Tout ce qui est sélectionné ici part dans le HTML, affiché ou non.
      // `delivery_floor_door`, `delivery_instructions` et `delivery_zone_id`
      // ont été RETIRÉS le 21.08 : ils n'étaient lus par aucun composant et
      // exposaient codes d'entrée et consignes de livraison à qui demandait
      // l'URL. N'ajoutez ici que ce qui est réellement affiché au client.
      "id, order_number, customer_name, customer_phone, status, total_amount, created_at, requested_pickup_time, fulfillment_type, delivery_address, delivery_postal_code, delivery_city, customer_confirmed_delivered_at",
    )
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (!order) return null;

  const { data: items } = await sb
    .from("order_items")
    .select(
      "item_name_snapshot, item_price_snapshot, quantity, selected_options, subtotal, notes",
    )
    .eq("order_id", order.id);

  // Intrants ETA dès le SSR : la phase dérivée est juste au premier rendu
  // (sans eux, elle retomberait sur le statut brut jusqu'au premier poll).
  let etaIntrants = null;
  try {
    etaIntrants = await intrantsPourCommande(sb, {
      id: order.id as string,
      created_at: order.created_at as string,
      status: order.status as string,
      fulfillment_type: order.fulfillment_type as "pickup" | "delivery",
      delivery_zone_id: (order as { delivery_zone_id?: string | null })
        .delivery_zone_id,
    });
  } catch {
    /* best-effort : le poll les fournira */
  }

  return { ...order, items: items ?? [], eta_intrants: etaIntrants };
}

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: { orderNumber: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const brut = searchParams?.[PARAM_JETON];
  const jeton = Array.isArray(brut) ? brut[0] : brut;
  const order = await loadOrder(decodeURIComponent(params.orderNumber), jeton);
  if (!order) return notFound();

  // Le jeton descend au client : il en a besoin pour le polling de statut
  // (/api/orders/[id]) et pour le tap « ma commande est arrivée », qui sont
  // désormais gardés eux aussi. Sans lui, le suivi se figerait.
  return <ConfirmationClient order={order as any} accessToken={jeton ?? ""} />;
}
