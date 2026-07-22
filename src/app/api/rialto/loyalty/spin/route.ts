import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { BUSINESS_ID, CARD_ID, SPIN_WHEEL_ID } from "@/lib/loyaltyConstants";
import {
  generatePromoCode,
  type PromoDiscountType,
} from "@/lib/promoCodes";
import { renderTemplate, TEMPLATE_META } from "@/lib/smsTemplates";
import { sendSms } from "@/lib/brevo";
import { computeSpinAvailability } from "@/lib/spinAvailability";

export const dynamic = "force-dynamic";

type Segment = {
  label: string;
  color?: string;
  probability?: number;
  /**
   * Optionnel : déclare le type de remise que gagne ce segment. Si absent,
   * on infère à partir du libellé (heuristique). Sert à générer un code
   * promo réellement applicable côté Rialto.
   */
  discount_type?: PromoDiscountType;
  discount_value?: number;
  free_item_label?: string;
  /** `true` pour les segments "Perdu / Dommage" — aucun code n'est généré. */
  is_loss?: boolean;
};

/** Détecte si un segment est un "perdu" — heuristique sur le label. */
function isLosingSegment(seg: Segment): boolean {
  if (seg.is_loss === true) return true;
  const lbl = (seg.label || "").toLowerCase();
  return (
    lbl.includes("perdu") ||
    lbl.includes("dommage") ||
    lbl.includes("retente") ||
    lbl === "rien"
  );
}

/**
 * Convertit un segment de la roue en paramètres pour generatePromoCode.
 * Tente de lire les champs explicites puis fallback sur une heuristique
 * de parsing du label ("10%", "5 CHF", "Tiramisu offert"...).
 */
function segmentToPromoInput(seg: Segment): {
  discount_type: PromoDiscountType;
  discount_value?: number;
  free_item_label?: string;
} {
  if (seg.discount_type) {
    return {
      discount_type: seg.discount_type,
      discount_value: seg.discount_value,
      free_item_label: seg.free_item_label,
    };
  }
  const lbl = seg.label || "";
  const pct = lbl.match(/(\d{1,2})\s*%/);
  if (pct) return { discount_type: "percent", discount_value: Number(pct[1]) };
  const chf = lbl.match(/(\d{1,3})\s*(CHF|chf|fr)/);
  if (chf) return { discount_type: "fixed", discount_value: Number(chf[1]) };
  // Fallback : traite comme article offert
  return { discount_type: "free_item", free_item_label: lbl };
}

/**
 * POST /api/rialto/loyalty/spin
 * Body: { phone, first_name? }
 *
 * Lance un spin côté serveur (décision random pondérée par probability).
 * Enregistre dans spin_entries + spin_results. La disponibilité (fréquence /
 * jours autorisés) est déléguée à computeSpinAvailability (D1 — source unique).
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    phone?: string;
    first_name?: string;
  } | null;

  if (!body?.phone?.trim()) {
    return NextResponse.json(
      { error: "phone requis" },
      { status: 400 },
    );
  }

  const admin = supabaseService();
  const phone = body.phone.trim();

  const { data: wheel } = await admin
    .from("spin_wheels")
    .select("id, segments, frequency, is_active, require_google_review")
    .eq("id", SPIN_WHEEL_ID)
    .maybeSingle();

  if (!wheel || !wheel.is_active) {
    return NextResponse.json(
      { error: "La roue n'est pas active actuellement." },
      { status: 409 },
    );
  }

  // Si la roue exige un avis Google, vérifier qu'un claim actif existe
  if (wheel.require_google_review) {
    // Retrouve le customer_id depuis la carte Rialto liée à ce phone
    const { data: cards } = await admin
      .from("customer_cards")
      .select("customer_id, customers!inner (phone)")
      .eq("card_id", CARD_ID)
      .eq("customers.phone", phone)
      .limit(1);
    const customerId =
      Array.isArray(cards) && cards.length > 0
        ? (cards[0].customer_id as string)
        : null;

    if (!customerId) {
      return NextResponse.json(
        {
          error: "Aucune carte fidélité trouvée pour ce numéro.",
          requires_review: true,
        },
        { status: 403 },
      );
    }

    const { data: claim } = await admin
      .from("google_review_claims")
      .select("id, expires_at")
      .eq("customer_id", customerId)
      .eq("business_id", BUSINESS_ID)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (!claim) {
      return NextResponse.json(
        {
          error: "Laissez un avis Google pour débloquer votre tour.",
          requires_review: true,
          customer_id: customerId,
        },
        { status: 403 },
      );
    }
  }

  // Vérif disponibilité (D1) : remplace le bloc fréquence legacy par la
  // source unique. L'état review (B) est déjà géré ci-dessus.
  const availability = await computeSpinAvailability({
    wheelId: SPIN_WHEEL_ID,
    phone,
    customerId: null,
  });
  if (!availability.can_spin && availability.state !== "B") {
    return NextResponse.json(
      { error: availability.message },
      { status: 409 },
    );
  }

  // Tire un segment pondéré
  const segments = Array.isArray(wheel.segments)
    ? (wheel.segments as Segment[])
    : [];
  if (segments.length === 0) {
    return NextResponse.json(
      { error: "Aucun segment configuré pour la roue." },
      { status: 409 },
    );
  }

  const totalWeight = segments.reduce(
    (s, seg) => s + (seg.probability ?? 1),
    0,
  );
  let pick = Math.random() * totalWeight;
  let chosenIndex = 0;
  for (let i = 0; i < segments.length; i++) {
    const w = segments[i].probability ?? 1;
    if (pick < w) {
      chosenIndex = i;
      break;
    }
    pick -= w;
  }
  const chosen = segments[chosenIndex];

  // Save — on garde l'id du spin pour lier le code promo généré plus
  // bas (fix D3 : spin_entries.promo_code_id n'était jamais écrit →
  // réconciliation code↔spin impossible côté dashboard).
  const { data: spinEntry } = await admin
    .from("spin_entries")
    .insert({
      wheel_id: SPIN_WHEEL_ID,
      phone,
      last_spin_at: new Date().toISOString(),
      reward_won: chosen.label,
    })
    .select("id")
    .single();
  await admin.from("spin_results").insert({
    wheel_id: SPIN_WHEEL_ID,
    first_name: body.first_name ?? "Client",
    phone,
    reward: chosen.label,
  });

  // Segment perdu → pas de code
  if (isLosingSegment(chosen)) {
    return NextResponse.json({
      ok: true,
      segment_index: chosenIndex,
      reward: chosen.label,
      color: chosen.color ?? null,
      total_segments: segments.length,
      code: null,
    });
  }

  // Retrouver customer_id si existe (pour traçabilité, optionnel)
  let customerId: string | null = null;
  try {
    const { data: cards } = await admin
      .from("customer_cards")
      .select("customer_id, customers!inner (phone)")
      .eq("card_id", CARD_ID)
      .eq("customers.phone", phone)
      .limit(1);
    if (cards && cards.length > 0) {
      customerId = cards[0].customer_id as string;
    }
  } catch (err) {
    console.warn("[spin] lookup customer failed (non-blocking)", err);
  }

  // Générer un code promo réel en DB
  const promoInput = segmentToPromoInput(chosen);
  const gen = await generatePromoCode({
    business_id: BUSINESS_ID,
    restaurant_id: RESTAURANT_ID,
    customer_id: customerId,
    phone,
    source: "spin_wheel",
    discount_type: promoInput.discount_type,
    discount_value: promoInput.discount_value ?? null,
    free_item_label: promoInput.free_item_label ?? null,
    min_order_amount: 0,
    max_uses: 1,
    // ⚠️ COUPLAGE : le template SMS `wheel_prize_code` (table sms_templates,
    // éditable au dashboard) RÉPÈTE cette durée en toutes lettres
    // (« Valable 30 jours »). Changer ce chiffre sans corriger le template
    // enverrait au client une durée fausse — c'est exactement le défaut
    // trouvé sur `referral_success` le 22.07 (30 annoncés, 60 réels).
    valid_days: 30,
  });

  if (!gen.ok) {
    console.error("[spin] promo code generation failed", gen.error);
    return NextResponse.json({
      ok: true,
      segment_index: chosenIndex,
      reward: chosen.label,
      color: chosen.color ?? null,
      total_segments: segments.length,
      code: null,
      warning: "Code promo non généré — contactez le restaurant.",
    });
  }

  const promoCode = gen.code.code;

  // Fix D3 : lie le spin à son code promo (best-effort, non-bloquant).
  if (spinEntry?.id) {
    const { error: linkErr } = await admin
      .from("spin_entries")
      .update({ promo_code_id: gen.code.id })
      .eq("id", spinEntry.id);
    if (linkErr) {
      console.warn("[spin] promo_code_id link failed (non-blocking)", linkErr);
    }
  }

  // Envoi SMS (template wheel_prize_code, non-bloquant)
  void (async () => {
    try {
      const { data: tmpl } = await admin
        .from("sms_templates")
        .select("content, enabled")
        .eq("restaurant_id", RESTAURANT_ID)
        .eq("template_key", "wheel_prize_code")
        .maybeSingle();

      const effective = tmpl ?? {
        content: TEMPLATE_META.wheel_prize_code.defaultContent,
        enabled: true,
      };
      if (!effective.enabled) {
        console.log("[spin] wheel_prize_code template disabled, skipping SMS");
        return;
      }

      const content = renderTemplate(effective.content, {
        customer_name: body.first_name ?? "",
        reward_label: chosen.label,
        code: promoCode,
        restaurant_name: "Rialto",
      });

      // Cascade sender : Rialto → Stampify si FR
      try {
        await sendSms(phone, content, "Rialto");
        console.log("[spin] SMS wheel_prize_code sent (Rialto)", {
          phone,
          code: promoCode,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("sender") || msg.includes("400")) {
          console.warn("[spin] Rialto sender refusé, retry Stampify", msg);
          await sendSms(phone, content, "Stampify");
        } else {
          throw err;
        }
      }
    } catch (err) {
      console.error("[spin] SMS send failed", err);
    }
  })();

  return NextResponse.json({
    ok: true,
    segment_index: chosenIndex,
    reward: chosen.label,
    color: chosen.color ?? null,
    total_segments: segments.length,
    code: promoCode,
    valid_until: gen.code.valid_until,
  });
}
