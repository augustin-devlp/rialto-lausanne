import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { LOTTERY_ID } from "@/lib/loyaltyConstants";
import { phoneLookupVariants } from "@/lib/phoneVariants";
import {
  requireDashboardAuth,
  isDashboardConfigured,
} from "@/lib/dashboardAuth";
import {
  zurichMonthStart,
  generateClaimToken,
  maskPhone,
  isMissingTableError,
} from "@/lib/lotteryDraw";
import { RESTAURANT_ID } from "@/lib/supabase";
import { BUSINESS_ID } from "@/lib/loyaltyConstants";
import { generatePromoCode } from "@/lib/promoCodes";
import { renderTemplate, TEMPLATE_META } from "@/lib/smsTemplates";
import { sendSms } from "@/lib/brevo";
import { logSms } from "@/lib/smsLogging";

export const dynamic = "force-dynamic";

/**
 * POST /api/dashboard/lottery/draw — LE tirage mensuel.
 *
 * Séquence :
 *  1. lottery_draws existe ? sinon 503 migration_pending (navette caisse).
 *  2. Anti-double-tirage : draw (lottery_id, mois Europe/Zurich) déjà là → 409.
 *     (l'UNIQUE DB re-garantit en cas de course, INSERT → 23505 → 409)
 *  3. Convertit les lottery_participants en lottery_entries (tickets
 *     auto-numérotés par le trigger DB), en résolvant customer_id par
 *     téléphone pour que le gagnant voie son état « gagné » sur le site
 *     (l'UI client matche par customer_id).
 *  4. Tire au hasard (crypto.randomInt) parmi les tickets créés.
 *  5. INSERT lottery_draws EN PREMIER (réordonné, relecture 19.08) :
 *     l'UNIQUE(lottery_id, month) verrouille TOUTE la suite — course ou
 *     retry → 409 avant tout effet (ni promo, ni gagnant marqué).
 *  6. UNIFICATION ROUE (lot G, GO Augustin 19.08) : le gain devient un
 *     CODE PROMO applicable au checkout — generatePromoCode
 *     (source='lottery', free_item = lot de la loterie, 30 jours, même
 *     mécanique que la roue) ; le code promo est écrit dans claim_token
 *     du ticket gagnant : l'écran client l'affiche et validatePromoCode
 *     l'accepte au checkout (aucun filtre de source) ; au checkout, le
 *     lot est matérialisé dans la NOTE de commande (seule surface lue
 *     par la cuisine — POST /api/orders). REPLI si la génération
 *     échoue : claim_token retombe sur l'ancien code de retrait comptoir
 *     (generateClaimToken) — dégradé, pas cassé ; si le MARQUAGE échoue
 *     après le journal, le promo est supprimé (pas d'orphelin actif).
 *  7. lotteries.draw_date=now() + is_active=false → le site affiche
 *     gagnant (confettis + code) et perdants automatiquement.
 *  8. SMS lottery_winner au gagnant (template DB, vouvoyé) — ATTENDU
 *     avant le return (piège serverless roue 17.08 : un fire-and-forget
 *     post-réponse ne part jamais), échec non-bloquant, logSms posé.
 *     ⚠️ COUPLAGE : le template annonce « 30 jours » en toutes lettres —
 *     aligné sur valid_days: 30 ci-dessous (défaut referral_success 22.07).
 *
 * (La mention historique « pas de SMS v1 » est caduque depuis le 19.08 ;
 * cf. mémoire refus-sans-sms pour order_cancelled, jamais concerné ici.)
 */
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

  const sb = supabaseService();
  const month = zurichMonthStart();

  // 1+2. Table présente ? Tirage du mois déjà fait ?
  const { data: existing, error: checkErr } = await sb
    .from("lottery_draws")
    .select("id")
    .eq("lottery_id", LOTTERY_ID)
    .eq("month", month)
    .maybeSingle();

  if (checkErr) {
    if (isMissingTableError(checkErr)) {
      return NextResponse.json(
        { ok: false, error: "migration_pending" },
        { status: 503 },
      );
    }
    console.error("[lottery/draw] check failed", checkErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }
  if (existing) {
    return NextResponse.json(
      { ok: false, error: "deja_tire_ce_mois" },
      { status: 409 },
    );
  }

  // Loterie (lot + template de repli du code retrait).
  const { data: lottery } = await sb
    .from("lotteries")
    .select("id, claim_token_template, prize_description, reward_description")
    .eq("id", LOTTERY_ID)
    .maybeSingle();
  if (!lottery) {
    return NextResponse.json(
      { ok: false, error: "loterie_introuvable" },
      { status: 404 },
    );
  }

  // 3. Participants DU MOIS → tickets (design 3 : participation
  //    mensuelle). Repli sans filtre si la colonne month n'existe pas
  //    encore (migration L1 en navette — 42703).
  let { data: participants, error: pErr } = await sb
    .from("lottery_participants")
    .select("first_name, phone")
    .eq("lottery_id", LOTTERY_ID)
    .eq("month", month);
  if (pErr && pErr.code === "42703") {
    ({ data: participants, error: pErr } = await sb
      .from("lottery_participants")
      .select("first_name, phone")
      .eq("lottery_id", LOTTERY_ID));
  }

  if (pErr) {
    console.error("[lottery/draw] participants failed", pErr);
    return NextResponse.json(
      { ok: false, error: "query_failed" },
      { status: 500 },
    );
  }
  if (!participants || participants.length === 0) {
    return NextResponse.json(
      { ok: false, error: "aucun_participant" },
      { status: 400 },
    );
  }

  // Résolution customer_id par téléphone (best-effort, batch).
  const allVariants = new Set<string>();
  const variantsByPhone = new Map<string, string[]>();
  for (const p of participants) {
    const { variants } = phoneLookupVariants(p.phone);
    variantsByPhone.set(p.phone, variants);
    variants.forEach((v) => allVariants.add(v));
  }
  const { data: customers } = await sb
    .from("customers")
    .select("id, phone")
    .in("phone", Array.from(allVariants));
  const customerByPhone = new Map(
    (customers ?? []).map((c) => [c.phone, c.id]),
  );
  function resolveCustomerId(phone: string): string | null {
    for (const v of variantsByPhone.get(phone) ?? []) {
      const id = customerByPhone.get(v);
      if (id) return id;
    }
    return null;
  }

  // Insertion séquentielle (trigger ticket_number = MAX+1 non verrouillé :
  // on évite toute concurrence d'insertion).
  const entryIds: string[] = [];
  for (const p of participants) {
    const { data: entry, error: eErr } = await sb
      .from("lottery_entries")
      .insert({
        lottery_id: LOTTERY_ID,
        first_name: p.first_name,
        phone: p.phone,
        customer_id: resolveCustomerId(p.phone),
      })
      .select("id")
      .single();
    if (eErr || !entry) {
      console.error("[lottery/draw] entry insert failed", eErr);
      return NextResponse.json(
        { ok: false, error: "tickets_failed" },
        { status: 500 },
      );
    }
    entryIds.push(entry.id);
  }

  // 4. Tirage.
  const winnerId = entryIds[crypto.randomInt(entryIds.length)];

  // 5. Journal du tirage EN PREMIER — l'UNIQUE(lottery_id, month) est LE
  // verrou de toute la séquence (relecture 19.08) : une requête
  // concurrente ou un retry prend 23505 → 409 ICI, AVANT d'avoir généré
  // un code promo ou marqué un gagnant. L'ancien ordre (promo + marquage
  // avant le journal) laissait à la requête perdante un 2e gagnant marqué
  // et un free_item encaissable. Résidu assumé : les tickets insérés à
  // l'étape 3 par la requête perdante restent en base (pollution sans
  // effet : le tirage ne pioche que dans SES entryIds).
  const { error: dErr } = await sb.from("lottery_draws").insert({
    lottery_id: LOTTERY_ID,
    month,
    winner_entry_id: winnerId,
    drawn_by: "dashboard",
  });
  if (dErr) {
    if (dErr.code === "23505") {
      return NextResponse.json(
        { ok: false, error: "deja_tire_ce_mois" },
        { status: 409 },
      );
    }
    console.error("[lottery/draw] draw insert failed", dErr);
    return NextResponse.json(
      { ok: false, error: "draw_failed" },
      { status: 500 },
    );
  }

  // 6. UNIFICATION ROUE : le gain = un code promo checkout. Le lot de la
  // loterie devient un free_item (le gain est porté par le libellé, pas
  // par une remise chiffrée — pattern segments roue).
  const winnerRow = participants[entryIds.indexOf(winnerId)];
  const prizeLabel =
    (lottery.prize_description as string | null) ??
    (lottery.reward_description as string | null) ??
    "votre lot";
  const gen = await generatePromoCode({
    business_id: BUSINESS_ID,
    restaurant_id: RESTAURANT_ID,
    customer_id: winnerRow ? resolveCustomerId(winnerRow.phone) : null,
    phone: winnerRow?.phone ?? null,
    source: "lottery",
    discount_type: "free_item",
    discount_value: 0,
    free_item_label: prizeLabel,
    min_order_amount: 0,
    max_uses: 1,
    // ⚠️ COUPLAGE : le template SMS lottery_winner annonce « 30 jours ».
    valid_days: 30,
  });
  if (!gen.ok) {
    // Dégradé, pas cassé : l'ancien code de retrait comptoir.
    console.error("[lottery/draw] promo generation failed", gen.error);
  }
  const claimToken = gen.ok
    ? gen.code.code
    : generateClaimToken(lottery.claim_token_template);

  const { data: winner, error: wErr } = await sb
    .from("lottery_entries")
    .update({ is_winner: true, claim_token: claimToken })
    .eq("id", winnerId)
    .select("id, first_name, phone, ticket_number, claim_token")
    .single();

  if (wErr || !winner) {
    console.error("[lottery/draw] winner update failed", wErr);
    // Nettoyage : sans marquage, le code promo n'est affiché nulle part et
    // aucun SMS ne partira — on ne laisse pas un free_item orphelin actif
    // 30 jours en base (relecture 19.08). Le tirage étant journalisé, le
    // retry rendra 409 : réparation MANUELLE (marquer l'entry winnerId et
    // reposer un code) — dégradé rare, sans double gagnant possible.
    if (gen.ok) {
      await sb.from("promo_codes").delete().eq("id", gen.code.id);
    }
    return NextResponse.json(
      { ok: false, error: "winner_failed" },
      { status: 500 },
    );
  }

  // 7. La loterie passe « tirée » → le site affiche gagnant/perdants.
  await sb
    .from("lotteries")
    .update({ draw_date: new Date().toISOString(), is_active: false })
    .eq("id", LOTTERY_ID);

  // 8. SMS au gagnant (template lottery_winner). ATTENDU avant le
  // return — piège serverless (roue, constat e2e 17.08) : un envoi lancé
  // après la réponse est gelé avec la lambda. Échec non-bloquant : le
  // tirage est valide même si le SMS échoue (l'écran client affiche le
  // code). Envoyé UNIQUEMENT si le code promo a bien été généré — un SMS
  // annonçant un code checkout pour un code de retrait serait un mensonge.
  let smsEnvoye = false;
  if (gen.ok) {
    const winnerCustomerId = winnerRow
      ? resolveCustomerId(winnerRow.phone)
      : null;
    await (async () => {
      try {
        const { data: tmpl } = await sb
          .from("sms_templates")
          .select("content, enabled")
          .eq("restaurant_id", RESTAURANT_ID)
          .eq("template_key", "lottery_winner")
          .maybeSingle();
        const effective = tmpl ?? {
          content: TEMPLATE_META.lottery_winner.defaultContent,
          enabled: true,
        };
        if (!effective.enabled || !effective.content) {
          console.log("[lottery/draw] lottery_winner template disabled/absent, skipping SMS");
          return;
        }
        const content = renderTemplate(effective.content, {
          customer_name: winner.first_name ?? "",
          reward_label: prizeLabel,
          code: claimToken,
          restaurant_name: "Rialto",
        });
        // Cascade sender maison : Rialto → Stampify.
        let senderUtilise = "Rialto";
        try {
          await sendSms(winner.phone, content, "Rialto");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("sender") || msg.includes("400")) {
            console.warn("[lottery/draw] Rialto sender refusé, retry Stampify", msg);
            await sendSms(winner.phone, content, "Stampify");
            senderUtilise = "Stampify";
          } else {
            throw err;
          }
        }
        await logSms({
          restaurant_id: RESTAURANT_ID,
          customer_id: winnerCustomerId,
          phone: winner.phone,
          template_key: "lottery_winner",
          sender_used: senderUtilise,
          content,
          status: "sent",
        });
        smsEnvoye = true;
      } catch (err) {
        console.error("[lottery/draw] SMS send failed", err);
        await logSms({
          restaurant_id: RESTAURANT_ID,
          customer_id: winnerCustomerId,
          phone: winner.phone,
          template_key: "lottery_winner",
          sender_used: "Rialto",
          content: "",
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }

  return NextResponse.json({
    ok: true,
    winner: {
      entry_id: winner.id,
      first_name: winner.first_name,
      phone_masked: maskPhone(winner.phone),
      phone: winner.phone,
      ticket_number: winner.ticket_number,
      claim_token: winner.claim_token,
    },
    promo_genere: gen.ok,
    sms_envoye: smsEnvoye,
    tickets_total: entryIds.length,
    month,
  });
}
