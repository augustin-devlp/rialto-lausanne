import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import {
  isPushConfigured,
  sendToSubscription,
  type PushPayload,
} from "@/lib/pushSend";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/dashboard/push/send — la cascade push du patron.
 * Body : { title, message, url? }.
 *
 * - Envoie à TOUS les push_subscriptions is_active=true (par paquets de 10).
 * - 404/410 (endpoint mort) → is_active=false + failure_count+1 :
 *   le compteur de destinataires s'assainit à chaque envoi.
 * - Succès → last_success_at.
 * - Journalise dans push_logs (tolérant si la migration D5b n'est pas
 *   encore exécutée : l'envoi marche, le journal tombe en console).
 *
 * Textes destinés aux CLIENTS : la responsabilité du vouvoiement est côté
 * patron (composer libre) — l'UI le rappelle avant envoi.
 */

const TITLE_MAX = 60;
const BODY_MAX = 180;

export async function POST(req: NextRequest) {
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
  if (!isPushConfigured()) {
    return NextResponse.json(
      { ok: false, error: "push_not_configured" },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    title?: string;
    message?: string;
    url?: string;
  } | null;

  const title = body?.title?.trim() ?? "";
  const message = body?.message?.trim() ?? "";
  const url = body?.url?.trim() || "/menu";

  if (!title || !message) {
    return NextResponse.json(
      { ok: false, error: "titre_et_message_requis" },
      { status: 400 },
    );
  }
  if (title.length > TITLE_MAX || message.length > BODY_MAX) {
    return NextResponse.json(
      { ok: false, error: "trop_long" },
      { status: 400 },
    );
  }

  const sb = supabaseService();
  const { data: subs, error: sErr } = await sb
    .from("push_subscriptions")
    .select("id, subscription")
    .eq("is_active", true);

  if (sErr) {
    console.error("[push/send] subs query failed", sErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }

  const recipients = subs ?? [];
  if (recipients.length === 0) {
    return NextResponse.json(
      { ok: false, error: "aucun_destinataire" },
      { status: 400 },
    );
  }

  const payload: PushPayload = {
    title,
    body: message,
    url,
    tag: "rialto-dashboard",
  };

  let sent = 0;
  let failed = 0;
  let deactivated = 0;

  const BATCH = 10;
  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (r) => {
        const outcome = await sendToSubscription(r.subscription, payload);
        if (outcome === "sent") {
          sent += 1;
          await sb
            .from("push_subscriptions")
            .update({ last_success_at: new Date().toISOString() })
            .eq("id", r.id);
        } else if (outcome === "gone") {
          deactivated += 1;
          await sb
            .from("push_subscriptions")
            .update({
              is_active: false,
              last_error_at: new Date().toISOString(),
            })
            .eq("id", r.id);
        } else {
          failed += 1;
          await sb
            .from("push_subscriptions")
            .update({ last_error_at: new Date().toISOString() })
            .eq("id", r.id);
        }
      }),
    );
    // Promise.allSettled n'échoue jamais ; les compteurs sont incrémentés
    // dans les callbacks. results n'est lu que pour la complétude.
    void results;
  }

  // Journal (tolérant : la table peut être en navette D5b).
  const { error: logErr } = await sb.from("push_logs").insert({
    restaurant_id: RESTAURANT_ID,
    title,
    body: message,
    url,
    recipients_total: recipients.length,
    sent_count: sent,
    failed_count: failed,
    deactivated_count: deactivated,
    sent_by: "dashboard",
  });
  const logged = !logErr;
  if (logErr) {
    console.warn(
      "[push/send] journal indisponible (migration D5b en attente ?)",
      logErr.code,
    );
  }

  return NextResponse.json({
    ok: true,
    recipients_total: recipients.length,
    sent,
    failed,
    deactivated,
    logged,
  });
}
