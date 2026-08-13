import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { intrantsPourZone } from "@/lib/eta/server";
import { computeEtaRange, formatEtaRange } from "@/lib/eta/eta";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/eta?postal_code=XXXX — fourchette de livraison PUBLIQUE
 * et VIVANTE pour une zone (chantier statuts, 08.08.2026).
 *
 * Sert le checkout et le menu : remplace l'ETA de zone figé en
 * localStorage (« ~40 min ») par la fourchette du MÊME moteur que la
 * page de suivi (zone + file + rush + occupation livreur) — une seule
 * source de calcul, aucune divergence possible. Le figé reste le repli
 * réseau côté client.
 *
 * AUCUNE donnée personnelle : des compteurs agrégés et des minutes.
 * Cache CDN 60 s : l'information est indicative, pas tarifaire.
 */
export async function GET(req: NextRequest) {
  // Les refus sont cachés eux aussi : endpoint public sans auth ni rate
  // limit — sans s-maxage, chaque CP fantaisiste taperait la base.
  const enteteCache = {
    "cache-control": "public, max-age=0, s-maxage=60",
  };

  const postal = new URL(req.url).searchParams.get("postal_code")?.trim();
  if (!postal || !/^\d{4}$/.test(postal)) {
    return NextResponse.json({ ok: false }, { status: 400, headers: enteteCache });
  }

  const sb = supabaseService();
  const intrants = await intrantsPourZone(sb, postal);
  if (!intrants) {
    return NextResponse.json({ ok: false }, { status: 404, headers: enteteCache });
  }

  const range = computeEtaRange({
    fulfillmentType: "delivery",
    prepBaseMinutes: intrants.prep_base_minutes,
    zoneMinutes: intrants.zone_minutes,
    queueAhead: intrants.queue_ahead,
    inCourse: intrants.in_course,
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
