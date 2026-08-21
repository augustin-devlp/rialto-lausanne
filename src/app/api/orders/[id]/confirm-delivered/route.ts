import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { TAP_AGE_MIN_MIN, TAP_AGE_MAX_H } from "@/lib/eta/constants";
import { estColonneAbsente } from "@/lib/dbErrors";
import { PARAM_JETON, verifyOrderToken } from "@/lib/orderAccess";

export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[id]/confirm-delivered — le TAP CLIENT « votre
 * commande est arrivée ? » (chantier recalibrage ETA, GO 18.08.2026).
 *
 * Écrit UNIQUEMENT orders.customer_confirmed_delivered_at (TAP1, en
 * navette) — JAMAIS orders.status (invariant : le site n'écrit pas les
 * statuts). Idempotent : premier tap gagnant (`IS NULL` conditionnel),
 * les suivants répondent ok sans écrire. L'écriture est bornée par les
 * MÊMES constantes que l'affichage du bouton (TAP_AGE_MIN/MAX,
 * constants.ts — source unique) et refuse les commandes `new` (rien ne
 * peut être livré avant l'acceptation) et `cancelled` (le refus est
 * re-vérifié SUR l'update — TOCTOU fermé). Pas de throttle dédié :
 * l'idempotence borne l'écriture à 1 par commande.
 *
 * Tant que TAP1 n'est pas exécutée : 503 tap1_non_executee (pattern
 * « colonne en navette »).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = supabaseService();
  const { data: order, error } = await sb
    .from("orders")
    .select("id, order_number, status, created_at")
    .eq("id", params.id)
    .eq("restaurant_id", RESTAURANT_ID)
    .maybeSingle();
  if (error) {
    // Id malformé (22P02) et erreurs de lecture : 404, comme le GET
    // frère — la saisie client ne doit pas polluer le taux de 500.
    console.warn("[tap] lecture commande en échec", error);
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  if (!order) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  // ⚠️ JETON EXIGÉ (21.08.2026). L'en-tête de cette route pariait sur
  // « l'UUID v4 fait office de jeton de capacité ». Le pari était FAUX tant
  // que la page de confirmation, publique et énumérable, publiait cet UUID
  // dans son HTML. Il redevient vrai maintenant qu'elle est fermée — mais
  // les UUID déjà diffusés le restent, donc on vérifie pour de bon.
  // Avant l'écriture : ce handler pose customer_confirmed_delivered_at,
  // qui nourrit le recalibrage de l'ETA. Un tiers pourrait fausser la
  // mesure de tous les délais de livraison.
  const jetonTap = new URL(_req.url).searchParams.get(PARAM_JETON);
  if (!verifyOrderToken(RESTAURANT_ID, order.order_number as string, jetonTap)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  if (order.status === "new") {
    return NextResponse.json(
      { ok: false, error: "pas_encore_confirmee" },
      { status: 409 },
    );
  }
  if (order.status === "cancelled") {
    return NextResponse.json(
      { ok: false, error: "commande_annulee" },
      { status: 409 },
    );
  }
  const ageMin =
    (Date.now() - new Date(order.created_at as string).getTime()) / 60_000;
  if (!Number.isFinite(ageMin) || ageMin > TAP_AGE_MAX_H * 60) {
    return NextResponse.json(
      { ok: false, error: "trop_tard" },
      { status: 410 },
    );
  }
  if (ageMin < TAP_AGE_MIN_MIN) {
    return NextResponse.json(
      { ok: false, error: "trop_tot" },
      { status: 409 },
    );
  }

  // NOTE PÉRIMÈTRE (review caisse 18.08, assumé par écrit) : le serveur
  // vérifie l'ÂGE mais pas la PHASE — il est plus permissif que l'UI
  // (qui n'affiche le bouton qu'en livraison/prête). Un POST direct en
  // début de préparation est donc accepté : au RECALIBRAGE, filtrer les
  // taps implausibles (croiser avec accepted_at + cuisine estimée).
  // ⚠️ CE PARAGRAPHE DISAIT, JUSQU'AU 21.08, que l'uuid v4 seul était
  // « acceptable SANS auth ni rate limit ». RETIRÉ : c'est faux depuis
  // que cette route exige un jeton HMAC (bloc `verifyOrderToken`
  // ci-dessus, garde
  // `verifyOrderToken`), et laisser la phrase invitait le lecteur suivant
  // à retirer cette garde en croyant l'uuid suffisant.
  const { data: ecrit, error: maj } = await sb
    .from("orders")
    .update({ customer_confirmed_delivered_at: new Date().toISOString() })
    .eq("id", order.id)
    // TOCTOU fermé : une annulation entre la lecture et l'écriture ne
    // reçoit pas de timestamp (et le recalibrage exclura de toute façon
    // les cancelled — biais documenté dans TAP1).
    .neq("status", "cancelled")
    .is("customer_confirmed_delivered_at", null)
    .select("id")
    .maybeSingle();
  if (maj) {
    if (estColonneAbsente(maj)) {
      return NextResponse.json(
        { ok: false, error: "tap1_non_executee" },
        { status: 503 },
      );
    }
    console.error("[tap] écriture en échec", maj);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Log honnête (review caisse 18.08) : le no-op (déjà confirmé, ou
  // annulé entre-temps) ne s'affiche plus en succès. Contrat HTTP
  // inchangé : ok dans les deux cas (idempotence).
  if (ecrit) {
    console.log("[tap] ✅ livraison confirmée par le client", {
      order: order.id,
    });
  } else {
    console.log("[tap] no-op (déjà confirmée ou annulée entre-temps)", {
      order: order.id,
    });
  }
  return NextResponse.json({ ok: true });
}
