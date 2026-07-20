import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { sendSms } from "@/lib/brevo";
import { logSms } from "@/lib/smsLogging";
import { renderTemplate, TEMPLATE_META } from "@/lib/smsTemplates";
import { BUSINESS_ID } from "@/lib/loyaltyConstants";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/reward-referrals
 * Cron 1×/jour à 09:15 UTC (vercel.json — PAS « toutes les 30 min »,
 * docstring historique corrigée en D4).
 *
 * Scanne les referrals 'claimed' dont le filleul a passé une commande
 * (status hors cancelled/refunded). Pour chaque match :
 *   - génère les 2 codes -100% (MARG{id}P parrain / MARG{id}F filleul,
 *     id = 6 premiers hex du referral, 60 jours) — idempotent : 23505 =
 *     codes déjà émis à un run précédent, on continue
 *   - envoie le SMS parrain ET le SMS filleul (D4 : le filleul ne
 *     recevait jamais son code) — statut/sender/erreur JOURNALISÉS
 *     HONNÊTEMENT dans sms_logs (fini le 'sent' hardcodé) ; idempotent
 *     aussi : un SMS déjà 'sent' pour (referral, rôle) n'est PAS renvoyé
 *     au re-run (crash entre envoi et passage 'rewarded')
 *   - un échec SMS ne bloque PAS le passage à 'rewarded' (fini les
 *     referrals coincés en 'claimed' qui re-tentaient tout au run
 *     suivant) : le statut SMS réel est visible au dashboard
 *   - renseigne referee_promo_code (best-effort : colonne D4a en
 *     navette — l'update est ignoré si elle n'existe pas encore)
 *
 * Auth : header Vercel x-vercel-cron OU x-cron-secret == CRON_SECRET.
 * D4 : plus AUCUN secret par défaut en dur — si CRON_SECRET n'est pas
 * configurée, les appels manuels sont refusés (fail-fast).
 */

type SmsOutcome = {
  status: "sent" | "failed";
  sender: string;
  error: string | null;
};

async function sendWithCascade(
  phone: string,
  content: string,
): Promise<SmsOutcome> {
  try {
    await sendSms(phone, content, "Rialto");
    return { status: "sent", sender: "Rialto", error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("sender") || msg.includes("400")) {
      try {
        await sendSms(phone, content, "Stampify");
        return { status: "sent", sender: "Stampify", error: null };
      } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        return { status: "failed", sender: "Stampify", error: msg2 };
      }
    }
    return { status: "failed", sender: "Rialto", error: msg };
  }
}

async function loadTemplate(
  admin: ReturnType<typeof supabaseService>,
  key: "referral_success" | "referral_claim_reward",
): Promise<{ content: string; enabled: boolean }> {
  const { data: tmpl } = await admin
    .from("sms_templates")
    .select("content, enabled")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("template_key", key)
    .maybeSingle();
  return tmpl ?? { content: TEMPLATE_META[key].defaultContent, enabled: true };
}

/**
 * Un SMS 'sent' existe-t-il déjà pour ce (referral, rôle) ? Garde
 * d'idempotence : un crash entre l'envoi et le passage 'rewarded'
 * laisse le referral en 'claimed' — au re-run, les codes sont skippés
 * (23505) et les SMS doivent l'être aussi.
 */
async function smsAlreadySent(
  admin: ReturnType<typeof supabaseService>,
  referralId: string,
  role: "parrain" | "filleul",
  templateKey: "referral_success" | "referral_claim_reward",
): Promise<boolean> {
  const { data } = await admin
    .from("sms_logs")
    .select("id")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("template_key", templateKey)
    .eq("status", "sent")
    .contains("context_meta", { referral_id: referralId, role })
    .limit(1);
  return Boolean(data && data.length > 0);
}

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("x-vercel-cron") === "1";
  const cronSecret = req.headers.get("x-cron-secret");
  const validSecret = process.env.CRON_SECRET;
  if (!isCron && (!validSecret || cronSecret !== validSecret)) {
    if (!validSecret) {
      console.warn(
        "[reward-referrals] appel manuel refusé : CRON_SECRET non configurée",
      );
    }
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = supabaseService();

  const { data: claimed } = await admin
    .from("referrals")
    .select(
      "id, referrer_customer_id, referee_phone, referee_customer_id, referral_code",
    )
    .eq("status", "claimed")
    .eq("restaurant_id", RESTAURANT_ID);

  const rewarded: string[] = [];
  let errors = 0;
  let smsFailed = 0;

  for (const ref of claimed ?? []) {
    try {
      // 1. Le filleul a-t-il commandé ?
      const { data: orders } = await admin
        .from("orders")
        .select("id, customer_phone, customer_id, status")
        .eq("restaurant_id", RESTAURANT_ID)
        .or(
          `customer_phone.eq.${ref.referee_phone},customer_id.eq.${ref.referee_customer_id ?? "00000000-0000-0000-0000-000000000000"}`,
        )
        .not("status", "in", "(cancelled,refunded)")
        .limit(1);

      if (!orders || orders.length === 0) continue;

      // 2. Les 2 codes -100% (idempotent : 23505 = déjà émis à un run
      //    précédent après un échec partiel — on continue sans bruit).
      //    6 hex (24 bits) : une collision silencieuse à 4 hex ferait
      //    partager un code usage-unique entre deux parrains. Même
      //    dérivation que le repli convention du dashboard parrainage.
      const shortId = (ref.id as string).slice(0, 6).toUpperCase();
      const codeParrain = `MARG${shortId}P`;
      const codeFilleul = `MARG${shortId}F`;
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 60);

      const basePromo = {
        business_id: BUSINESS_ID,
        restaurant_id: RESTAURANT_ID,
        discount_type: "percent",
        discount_value: 100,
        max_uses: 1,
        uses_count: 0,
        valid_from: new Date().toISOString(),
        valid_until: validUntil.toISOString(),
      };

      const { error: pErr } = await admin.from("promo_codes").insert({
        ...basePromo,
        code: codeParrain,
        customer_id: ref.referrer_customer_id,
        source: "referral",
      });
      if (pErr && pErr.code !== "23505") {
        throw new Error(`promo parrain: ${pErr.message}`);
      }

      const { error: fErr } = await admin.from("promo_codes").insert({
        ...basePromo,
        code: codeFilleul,
        phone: ref.referee_phone,
        customer_id: ref.referee_customer_id,
        source: "referral_claim",
      });
      if (fErr && fErr.code !== "23505") {
        throw new Error(`promo filleul: ${fErr.message}`);
      }

      // 3. SMS parrain — statut honnête, log TOUJOURS écrit.
      const { data: parrain } = await admin
        .from("customers")
        .select("phone, first_name")
        .eq("id", ref.referrer_customer_id)
        .maybeSingle();

      if (
        parrain?.phone &&
        !(await smsAlreadySent(
          admin,
          ref.id as string,
          "parrain",
          "referral_success",
        ))
      ) {
        const tmplParrain = await loadTemplate(admin, "referral_success");
        if (tmplParrain.enabled) {
          const content = renderTemplate(tmplParrain.content, {
            customer_name: parrain.first_name ?? "",
            reward_label: "une Pizza Marguerite offerte",
            code: codeParrain,
            restaurant_name: "Rialto",
          });
          const outcome = await sendWithCascade(parrain.phone, content);
          if (outcome.status === "failed") smsFailed += 1;
          await logSms({
            restaurant_id: RESTAURANT_ID,
            customer_id: ref.referrer_customer_id,
            phone: parrain.phone,
            template_key: "referral_success",
            sender_used: outcome.sender,
            content,
            status: outcome.status,
            error_message: outcome.error,
            context_meta: {
              referral_id: ref.id,
              code: codeParrain,
              role: "parrain",
            },
          });
        }
      }

      // 4. SMS filleul (D4 — n'existait pas : le filleul ne recevait
      //    jamais son code -100%).
      if (
        ref.referee_phone &&
        !(await smsAlreadySent(
          admin,
          ref.id as string,
          "filleul",
          "referral_claim_reward",
        ))
      ) {
        const { data: filleul } = ref.referee_customer_id
          ? await admin
              .from("customers")
              .select("first_name")
              .eq("id", ref.referee_customer_id)
              .maybeSingle()
          : { data: null };

        const tmplFilleul = await loadTemplate(admin, "referral_claim_reward");
        if (tmplFilleul.enabled) {
          // Prénom nu : renderTemplate trim chaque valeur, l'espace
          // vit dans le template (« Rialto {{customer_name}} ! » —
          // cas vide nettoyé par la compression des doubles espaces).
          const content = renderTemplate(tmplFilleul.content, {
            customer_name: filleul?.first_name?.trim() ?? "",
            code: codeFilleul,
            restaurant_name: "Rialto",
          });
          const outcome = await sendWithCascade(ref.referee_phone, content);
          if (outcome.status === "failed") smsFailed += 1;
          await logSms({
            restaurant_id: RESTAURANT_ID,
            customer_id: ref.referee_customer_id,
            phone: ref.referee_phone,
            template_key: "referral_claim_reward",
            sender_used: outcome.sender,
            content,
            status: outcome.status,
            error_message: outcome.error,
            context_meta: {
              referral_id: ref.id,
              code: codeFilleul,
              role: "filleul",
            },
          });
        }
      }

      // 5. Rewarded — même si un SMS a échoué (le statut réel est
      //    dans sms_logs, visible au dashboard ; on ne re-traite pas).
      await admin
        .from("referrals")
        .update({
          status: "rewarded",
          rewarded_at: new Date().toISOString(),
          reward_promo_code: codeParrain,
          referee_first_order_id: orders[0].id,
        })
        .eq("id", ref.id);

      // 6. Lien structurel code filleul (best-effort : colonne D4a en
      //    navette — PGRST204 tant qu'elle n'existe pas, on ignore).
      const { error: colErr } = await admin
        .from("referrals")
        .update({ referee_promo_code: codeFilleul })
        .eq("id", ref.id);
      if (colErr) {
        console.log(
          "[reward-referrals] referee_promo_code non écrit (migration D4a en attente ?)",
          colErr.code,
        );
      }

      rewarded.push(ref.id as string);
    } catch (err) {
      console.error("[reward-referrals] failed", ref.id, err);
      errors += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    checked: (claimed ?? []).length,
    rewarded: rewarded.length,
    sms_failed: smsFailed,
    errors,
  });
}
