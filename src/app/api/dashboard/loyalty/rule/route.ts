import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { CARD_ID } from "@/lib/loyaltyConstants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import { toStampRule } from "@/lib/loyalty/rule";
import { formatStampRuleLong } from "@/lib/loyalty/copy";
import { PENDING_MAX_AGE_MS } from "@/lib/loyalty/pending";

export const dynamic = "force-dynamic";

/**
 * GET/PATCH /api/dashboard/loyalty/rule — réglage du barème de fidélité (F1).
 *
 * Le restaurateur choisit entre « 1 tampon par tranche de X CHF » et
 * « 1 commande = 1 tampon », l'assiette (hors/avec livraison) et le plafond
 * par commande. Colonnes portées par loyalty_cards (migration F0/M1).
 *
 * GARDE ANTI-RÉTROACTIVITÉ : le PATCH est refusé s'il existe au moins une
 * commande en statut 'new'. Sans elle, changer le barème pendant qu'une
 * commande attend ferait BAISSER le nombre de tampons en attente déjà
 * affiché au client — un donné-repris visuel. Garde applicative assumée
 * (un UPDATE SQL manuel la contourne ; une seule personne a cet accès).
 *
 * Le killswitch stamp_online_enabled n'est PAS modifiable ici : l'activation
 * est un geste délibéré (F5), pas un réglage courant.
 */

const SELECT_COLS =
  "stamp_credit_mode, stamp_amount_step, stamp_amount_basis, stamp_max_per_order, stamp_online_enabled, stamps_required, reward_description";

function guard(req: NextRequest): NextResponse | null {
  if (!isDashboardConfigured()) {
    return NextResponse.json(
      { ok: false, error: "dashboard_not_configured" },
      { status: 500 },
    );
  }
  if (!requireDashboardAuth(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const sb = supabaseService();
  const { data, error } = await sb
    .from("loyalty_cards")
    .select(SELECT_COLS)
    .eq("id", CARD_ID)
    .maybeSingle();

  if (error || !data) {
    console.error("[dashboard/loyalty/rule] lecture échouée", error);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  const rule = toStampRule(data as Record<string, unknown>);
  return NextResponse.json(
    {
      ok: true,
      rule,
      apercu: formatStampRuleLong(rule),
      stamps_required: (data as { stamps_required?: number }).stamps_required ?? 10,
      reward_description:
        (data as { reward_description?: string }).reward_description ?? "",
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function PATCH(req: NextRequest) {
  const blocked = guard(req);
  if (blocked) return blocked;

  const body = (await req.json().catch(() => null)) as {
    mode?: string;
    step?: number | string;
    basis?: string;
    maxPerOrder?: number | string;
  } | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "body_invalide" }, { status: 400 });
  }

  // Validation stricte : on refuse plutôt que de corriger silencieusement.
  const mode = body.mode;
  if (mode !== "per_amount" && mode !== "per_order") {
    return NextResponse.json({ ok: false, error: "mode_invalide" }, { status: 400 });
  }
  const basis = body.basis;
  if (basis !== "goods" && basis !== "total") {
    return NextResponse.json({ ok: false, error: "basis_invalide" }, { status: 400 });
  }
  const step = Number(body.step);
  // Plancher à 1 CHF : une micro-tranche (0.01) transformerait le barème en
  // « toujours le plafond », ce qui n'est jamais l'intention.
  if (!Number.isFinite(step) || step < 1 || step > 1000) {
    return NextResponse.json({ ok: false, error: "tranche_invalide" }, { status: 400 });
  }
  const maxPerOrder = Number(body.maxPerOrder);
  if (!Number.isInteger(maxPerOrder) || maxPerOrder < 1 || maxPerOrder > 10) {
    return NextResponse.json({ ok: false, error: "plafond_invalide" }, { status: 400 });
  }

  const sb = supabaseService();

  // GARDE ANTI-RÉTROACTIVITÉ : aucune commande ne doit être en attente de
  // validation, sinon son pending déjà affiché changerait sous les yeux du
  // client.
  //
  // ⚠️ BORNÉE À LA MÊME FENÊTRE QUE LE PENDING (PENDING_MAX_AGE_MS, constante
  // partagée). Sans cette borne, la garde verrouillerait le barème À VIE :
  // aucun code de ce repo ne fait sortir une commande de 'new' (c'est la
  // caisse qui écrit le statut), donc une seule commande abandonnée suffirait
  // à refuser tout PATCH pour toujours. Seules les commandes qui affichent
  // RÉELLEMENT un pending doivent bloquer le changement de barème.
  //
  // TOCTOU assumé : une commande peut arriver entre ce comptage et l'UPDATE.
  // Conséquence maximale = un pending recalculé une fois ; sans commune
  // mesure avec le coût d'un verrou, au volume de Rialto.
  const depuis = new Date(Date.now() - PENDING_MAX_AGE_MS).toISOString();
  const { count: enAttente, error: cErr } = await sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("status", "new")
    .gte("created_at", depuis);

  if (cErr) {
    console.error("[dashboard/loyalty/rule] comptage commandes échoué", cErr);
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }
  if ((enAttente ?? 0) > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "commandes_en_attente",
        count: enAttente ?? 0,
        message: `${enAttente} commande${(enAttente ?? 0) > 1 ? "s" : ""} en attente de validation. Réessayez dans quelques minutes.`,
      },
      { status: 409 },
    );
  }

  const { data, error } = await sb
    .from("loyalty_cards")
    .update({
      stamp_credit_mode: mode,
      stamp_amount_step: step,
      stamp_amount_basis: basis,
      stamp_max_per_order: maxPerOrder,
    })
    .eq("id", CARD_ID)
    .select(SELECT_COLS)
    .maybeSingle();

  if (error || !data) {
    console.error("[dashboard/loyalty/rule] écriture échouée", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  const rule = toStampRule(data as Record<string, unknown>);
  return NextResponse.json({ ok: true, rule, apercu: formatStampRuleLong(rule) });
}
