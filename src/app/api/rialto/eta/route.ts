import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { intrantsPourZone } from "@/lib/eta/server";
import { computeEtaRange, formatEtaRange } from "@/lib/eta/eta";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/eta?postal_code=XXXX&pizzas=N — fourchette de livraison
 * PUBLIQUE et VIVANTE pour une zone (refonte par ressource, 18.08.2026).
 *
 * Sert le checkout et le menu : le MÊME moteur que la page de suivi —
 * une seule source de calcul, aucune divergence possible. `pizzas` = le
 * compte du panier client (les combos = 1 pizza chacun) ; absent →
 * défaut prudent. Le figé localStorage reste le repli réseau côté client.
 *
 * AUCUNE donnée personnelle : des compteurs agrégés et des minutes.
 * Cache CDN 60 s par URL — donc par (code postal, pizzas).
 */
export async function GET(req: NextRequest) {
  // Les refus sont cachés eux aussi : endpoint public sans auth ni rate
  // limit — sans s-maxage, chaque CP fantaisiste taperait la base.
  const enteteCache = {
    "cache-control": "public, max-age=0, s-maxage=60",
  };

  const url = new URL(req.url);
  const postal = url.searchParams.get("postal_code")?.trim();
  if (!postal || !/^\d{4}$/.test(postal)) {
    return NextResponse.json({ ok: false }, { status: 400, headers: enteteCache });
  }
  // pizzas : borné 0-30 (au-delà du palier 7+ ça ne change rien, et un
  // paramètre public ne doit pas fabriquer d'entiers fantaisistes).
  const pizzasBrut = url.searchParams.get("pizzas");
  const pizzas =
    pizzasBrut != null && /^\d{1,2}$/.test(pizzasBrut)
      ? Math.min(30, parseInt(pizzasBrut, 10))
      : null;

  const sb = supabaseService();
  const intrants = await intrantsPourZone(sb, postal, pizzas);
  if (!intrants) {
    return NextResponse.json({ ok: false }, { status: 404, headers: enteteCache });
  }

  const range = computeEtaRange({
    fulfillmentType: "delivery",
    pizzasCommande: intrants.pizzas_commande,
    pizzasEnCuisineDevant: intrants.pizzas_en_cuisine_devant,
    zoneMinutes: intrants.zone_minutes,
    retourLivreurMinutes: intrants.retour_livreur_minutes,
    poidsPrior: intrants.poids_prior,
    latence: null,
    now: new Date(),
  });

  return NextResponse.json(
    {
      ok: true,
      min_minutes: range.minMinutes,
      max_minutes: range.maxMinutes,
      label: formatEtaRange(range),
    },
    {
      headers: {
        "cache-control": "public, max-age=0, s-maxage=60",
      },
    },
  );
}
