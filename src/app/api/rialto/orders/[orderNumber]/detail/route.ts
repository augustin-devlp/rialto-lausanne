import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { phoneLookupVariants } from "@/lib/phoneVariants";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/orders/[orderNumber]/detail?phone=+41…
 *
 * Détail d'une commande passée, pour le DÉPLIEMENT SUR PLACE de la liste
 * « Mes commandes » (item 4 du lot 21.08) : le client voit ce qu'il a
 * mangé sans quitter sa liste et sans atterrir sur la page de SUIVI, qui
 * n'est pas faite pour ça.
 *
 * ⚠️ LECTURE PURE. Aucun effet de bord — contrairement à
 * GET /api/orders/[id] qui déclenche la solidification des tampons.
 * Charger un dépliement ne doit rien écrire.
 *
 * ⚠️ VÉRIFICATION DU PROPRIÉTAIRE (durcissement volontaire) : les numéros
 * de commande sont SÉQUENTIELS (R-2026-050 → R-2026-051), donc devinables.
 * ⚠️ CE PARAGRAPHE DISAIT, JUSQU'AU 21.08, que « la route sœur `reorder`
 * n'expose que des noms de plats et s'en accommode » — c'est-à-dire qu'elle
 * n'avait pas de vérification. C'est FAUX depuis : `reorder/route.ts:64-83`
 * vérifie le propriétaire par le MÊME mécanisme (téléphone de session,
 * comparaison sur variantes, 404 jamais 403).
 * La seule différence qui reste entre les deux : `detail` renvoie les
 * MONTANTS PAYÉS, `reorder` renvoie les prix catalogue du jour.
 * On exige donc le téléphone de session et on vérifie qu'il correspond au
 * client de la commande. Une commande devinée par son numéro ne rend rien.
 * (Toutes les commandes listées sur /mes-commandes ont un customer_id : la
 * liste est elle-même construite à partir du client connecté.)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { orderNumber: string } },
) {
  const phone = new URL(req.url).searchParams.get("phone")?.trim();
  if (!phone) {
    return NextResponse.json({ error: "phone_requis" }, { status: 400 });
  }

  const admin = supabaseService();

  const { data: order, error: erreurCommande } = await admin
    .from("orders")
    .select(
      "id, order_number, status, total_amount, delivery_fee, promo_discount_amount, customer_id, created_at",
    )
    .eq("order_number", params.orderNumber)
    .eq("restaurant_id", RESTAURANT_ID)
    .maybeSingle();

  // Panne DB ≠ commande inexistante (même règle que la vérification de
  // zone et la re-dérivation des prix) : on ne ment pas au client.
  if (erreurCommande) {
    return NextResponse.json({ error: "indisponible" }, { status: 503 });
  }
  if (!order || !order.customer_id) {
    return NextResponse.json({ error: "introuvable" }, { status: 404 });
  }

  // Le téléphone doit désigner LE client de cette commande.
  // ⚠️ Comparaison sur les VARIANTES, jamais en égalité brute : la base est
  // historiquement mixte (+41…, 41…, 07…) et c'est ce que fait déjà tout le
  // reste du dépôt (loyalty/lookup, POST /api/orders, login-by-phone). Une
  // égalité brute ici donnerait un 404 PERMANENT à tout client dont la
  // session porte un format différent de celui stocké — un refus définitif,
  // sur un écran qui lui dirait « réessayez dans un instant ».
  const variantes = phoneLookupVariants(phone).variants;
  const { data: client } = await admin
    .from("customers")
    .select("id")
    .eq("id", order.customer_id)
    .in("phone", variantes.length > 0 ? variantes : [phone])
    .maybeSingle();
  if (!client) {
    // 404 et non 403 : ne pas confirmer l'existence d'un numéro deviné.
    return NextResponse.json({ error: "introuvable" }, { status: 404 });
  }

  const { data: items, error: erreurItems } = await admin
    .from("order_items")
    .select("item_name_snapshot, quantity, selected_options, subtotal, notes")
    .eq("order_id", order.id)
    .order("id");

  if (erreurItems) {
    return NextResponse.json({ error: "indisponible" }, { status: 503 });
  }

  const lignes = (items ?? []).map((it) => ({
    nom: String(it.item_name_snapshot ?? ""),
    quantite: Number(it.quantity ?? 1),
    // Libellés d'options seuls : le détail des suppléments est déjà
    // compris dans le sous-total de la ligne.
    options: Array.isArray(it.selected_options)
      ? (it.selected_options as Array<{ name?: string | null }>)
          .map((o) => String(o?.name ?? "").trim())
          .filter(Boolean)
      : [],
    notes: (it.notes ?? "").trim() || null,
    montant: Number(it.subtotal ?? 0),
  }));

  // Sous-total = somme des lignes RÉELLES (jamais une reconstruction par
  // soustraction : elle masquerait une incohérence au lieu de la montrer).
  const sousTotal =
    Math.round(lignes.reduce((s, l) => s + l.montant, 0) * 100) / 100;

  return NextResponse.json(
    {
      ok: true,
      lignes,
      montants: {
        sous_total: sousTotal,
        livraison: Number(order.delivery_fee ?? 0),
        remise: Number(order.promo_discount_amount ?? 0),
        total: Number(order.total_amount ?? 0),
      },
    },
    { headers: { "cache-control": "no-store" } },
  );
}
