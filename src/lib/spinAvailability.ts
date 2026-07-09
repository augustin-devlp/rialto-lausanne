/**
 * Source de vérité UNIQUE de l'état d'accès à la roue Rialto (décision D1).
 *
 * Portée VERBATIM depuis la logique du GET /api/spin/availability de
 * loyalty-cards (états A-E). Toutes les routes roue (availability, spin,
 * lookup) passent désormais par cette fonction — plus de logique de
 * fréquence divergente dupliquée.
 *
 * 5 états exclusifs :
 *   A  can_spin=true   Peut tourner la roue maintenant
 *   B  review_required Doit laisser un avis Google d'abord
 *   C  frequency_wait  A déjà tourné, doit attendre (mode frequency)
 *   D  wrong_day       Pas le bon jour (mode weekdays)
 *   E  disabled        Roue désactivée / pas de roue programmée
 */
import { supabaseService } from "@/lib/supabase";
import { BUSINESS_ID } from "@/lib/loyaltyConstants";

export type SpinState = "A" | "B" | "C" | "D" | "E";

export type SpinLastPrize = {
  code: string;
  description: string;
  used: boolean;
  expires_at: string | null;
};

export type SpinWaitInfo = {
  next_available_date: string;
  days_remaining: number;
};

export type SpinAvailability = {
  state: SpinState;
  can_spin: boolean;
  config_mode: string;
  message: string;
  last_prize: SpinLastPrize | null;
  wait_info: SpinWaitInfo | null;
  frequency_days: number | null;
  allowed_weekdays: number[];
  require_google_review: boolean;
};

const ISO_WEEKDAY_LABELS = [
  "",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
  "dimanche",
];

function isoWeekday(d: Date): number {
  // JS getDay(): 0=dim, 1=lun, ... 6=sam
  // On veut ISO : 1=lun, ..., 7=dim
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

function daysBetween(iso: string | Date, nowMs: number): number {
  const t = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return Math.max(0, Math.floor((nowMs - t) / (24 * 60 * 60 * 1000)));
}

function isSameDay(iso: string | Date, other: Date): boolean {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return (
    d.getFullYear() === other.getFullYear() &&
    d.getMonth() === other.getMonth() &&
    d.getDate() === other.getDate()
  );
}

function formatDateFR(d: Date): string {
  return d.toLocaleDateString("fr-CH", {
    day: "numeric",
    month: "long",
  });
}

/** Cherche le prochain jour ISO parmi `allowed` à partir de `from`. */
function nextAllowedWeekday(
  from: Date,
  allowed: number[],
): { date: Date; days_remaining: number } | null {
  if (!allowed.length) return null;
  for (let offset = 0; offset <= 14; offset++) {
    const candidate = new Date(from);
    candidate.setDate(from.getDate() + offset);
    if (allowed.includes(isoWeekday(candidate))) {
      return { date: candidate, days_remaining: offset };
    }
  }
  return null;
}

/**
 * Calcule l'état complet d'accès à la roue pour un client.
 *
 * Lit spin_wheels / customers / spin_entries / promo_codes /
 * google_review_claims via supabaseService(), exactement comme la source.
 * L'un de `phone` ou `customerId` doit être fourni par l'appelant.
 */
export async function computeSpinAvailability(params: {
  wheelId: string;
  phone: string | null;
  customerId: string | null;
}): Promise<SpinAvailability> {
  const { wheelId, phone: phoneArg, customerId } = params;
  const admin = supabaseService();

  // 1) Config de la roue
  const { data: wheel } = await admin
    .from("spin_wheels")
    .select(
      "id, is_active, config_mode, frequency_days, allowed_weekdays, require_google_review, segments",
    )
    .eq("id", wheelId)
    .maybeSingle();

  // État E : pas de roue ou désactivée
  if (
    !wheel ||
    !wheel.is_active ||
    wheel.config_mode === "disabled" ||
    (wheel.config_mode === "frequency" && wheel.frequency_days === null)
  ) {
    return {
      state: "E",
      can_spin: false,
      config_mode: (wheel?.config_mode as string) ?? "disabled",
      message:
        "Il n'y a pas de roue prévue pour l'instant. Tu seras prévenu par SMS quand une sera lancée.",
      last_prize: null,
      wait_info: null,
      frequency_days: null,
      allowed_weekdays: [],
      require_google_review: !!wheel?.require_google_review,
    };
  }

  const configMode = (wheel.config_mode as "frequency" | "weekdays") ?? "frequency";
  const frequencyDays: number | null =
    typeof wheel.frequency_days === "number" ? wheel.frequency_days : null;
  const allowedWeekdays: number[] = Array.isArray(wheel.allowed_weekdays)
    ? (wheel.allowed_weekdays as number[])
    : [];

  // 2) Customer + phone
  let phone = phoneArg ?? null;
  let effectiveCustomerId = customerId;
  if (customerId && !phone) {
    const { data: c } = await admin
      .from("customers")
      .select("phone")
      .eq("id", customerId)
      .maybeSingle();
    phone = (c?.phone as string | undefined) ?? null;
  } else if (!customerId && phone) {
    // Lookup customer via phone pour vérifier claim Google
    const { data: c } = await admin
      .from("customers")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    effectiveCustomerId = (c?.id as string) ?? null;
  }

  // 3) Dernière spin
  const { data: lastSpinRow } = phone
    ? await admin
        .from("spin_entries")
        .select("id, last_spin_at, reward_won, promo_code_id")
        .eq("wheel_id", wheelId)
        .eq("phone", phone)
        .order("last_spin_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const lastSpinAt = lastSpinRow?.last_spin_at
    ? new Date(lastSpinRow.last_spin_at as string)
    : null;

  // 4) Dernier prix (rappel code promo)
  let lastPrize: SpinLastPrize | null = null;

  if (lastSpinRow?.promo_code_id) {
    const { data: promo } = await admin
      .from("promo_codes")
      .select(
        "code, discount_type, discount_value, free_item_label, uses_count, max_uses, valid_until",
      )
      .eq("id", lastSpinRow.promo_code_id)
      .maybeSingle();
    if (promo) {
      const used =
        Number(promo.uses_count ?? 0) >= Number(promo.max_uses ?? 1);
      lastPrize = {
        code: (promo.code as string) ?? "",
        description:
          promo.discount_type === "percent"
            ? `-${promo.discount_value}% sur ta commande`
            : promo.discount_type === "fixed"
              ? `-${promo.discount_value} CHF`
              : (promo.free_item_label as string) ?? "Article offert",
        used,
        expires_at: (promo.valid_until as string) ?? null,
      };
    }
  } else if (lastSpinRow?.reward_won) {
    lastPrize = {
      code: "",
      description: lastSpinRow.reward_won as string,
      used: false,
      expires_at: null,
    };
  }

  const now = new Date();
  const nowMs = now.getTime();

  // 5) Review gate (ÉTAT B) — s'applique AVANT la logique de fréquence/weekdays
  if (wheel.require_google_review && effectiveCustomerId) {
    const { data: claim } = await admin
      .from("google_review_claims")
      .select("id, expires_at")
      .eq("customer_id", effectiveCustomerId)
      .eq("business_id", BUSINESS_ID)
      .gt("expires_at", now.toISOString())
      .order("claimed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!claim) {
      return {
        state: "B",
        can_spin: false,
        config_mode: configMode,
        message: "Laisse un avis Google pour débloquer la roue",
        last_prize: lastPrize,
        wait_info: null,
        frequency_days: frequencyDays,
        allowed_weekdays: allowedWeekdays,
        require_google_review: true,
      };
    }
  }

  // 6) Mode FREQUENCY
  if (configMode === "frequency") {
    // Pas de dernière spin → peut tourner
    if (!lastSpinAt) {
      return {
        state: "A",
        can_spin: true,
        config_mode: "frequency",
        message: "C'est parti, tourne la roue !",
        last_prize: null,
        wait_info: null,
        frequency_days: frequencyDays,
        allowed_weekdays: [],
        require_google_review: !!wheel.require_google_review,
      };
    }

    const days = daysBetween(lastSpinAt, nowMs);
    if (frequencyDays !== null && days < frequencyDays) {
      const daysRemaining = frequencyDays - days;
      const nextDate = new Date(nowMs + daysRemaining * 24 * 60 * 60 * 1000);
      const dateFR = formatDateFR(nextDate);
      return {
        state: "C",
        can_spin: false,
        config_mode: "frequency",
        message: `Tu as déjà tourné la roue. Prochaine chance le ${dateFR} (dans ${daysRemaining} jour${daysRemaining > 1 ? "s" : ""})`,
        last_prize: lastPrize,
        wait_info: {
          next_available_date: nextDate.toISOString(),
          days_remaining: daysRemaining,
        },
        frequency_days: frequencyDays,
        allowed_weekdays: [],
        require_google_review: !!wheel.require_google_review,
      };
    }

    // État A : peut tourner
    return {
      state: "A",
      can_spin: true,
      config_mode: "frequency",
      message: "C'est parti, tourne la roue !",
      last_prize: null,
      wait_info: null,
      frequency_days: frequencyDays,
      allowed_weekdays: [],
      require_google_review: !!wheel.require_google_review,
    };
  }

  // 7) Mode WEEKDAYS
  if (configMode === "weekdays") {
    if (!allowedWeekdays.length) {
      // Aucun jour coché = équivalent disabled
      return {
        state: "E",
        can_spin: false,
        config_mode: "weekdays",
        message:
          "Il n'y a pas de roue prévue pour l'instant. Tu seras prévenu par SMS quand une sera lancée.",
        last_prize: lastPrize,
        wait_info: null,
        frequency_days: null,
        allowed_weekdays: [],
        require_google_review: !!wheel.require_google_review,
      };
    }

    const todayIso = isoWeekday(now);
    const isTodayAllowed = allowedWeekdays.includes(todayIso);
    const alreadySpunToday =
      lastSpinAt !== null && isSameDay(lastSpinAt, now);

    // État D : pas le bon jour OU déjà spin aujourd'hui
    if (!isTodayAllowed || alreadySpunToday) {
      // Cherche le prochain jour autorisé
      const searchFrom = alreadySpunToday
        ? new Date(nowMs + 24 * 60 * 60 * 1000)
        : now;
      const next = nextAllowedWeekday(searchFrom, allowedWeekdays);
      const allowedLabel = allowedWeekdays
        .map((d) => ISO_WEEKDAY_LABELS[d])
        .join(", ");
      const msg = next
        ? `La roue est disponible le ${allowedLabel}. Prochain créneau : ${ISO_WEEKDAY_LABELS[isoWeekday(next.date)]} ${formatDateFR(next.date)}`
        : `La roue est disponible le ${allowedLabel}`;

      return {
        state: "D",
        can_spin: false,
        config_mode: "weekdays",
        message: msg,
        last_prize: lastPrize,
        wait_info: next
          ? {
              next_available_date: next.date.toISOString(),
              days_remaining: next.days_remaining,
            }
          : null,
        frequency_days: null,
        allowed_weekdays: allowedWeekdays,
        require_google_review: !!wheel.require_google_review,
      };
    }

    // État A : jour valide + pas encore spin aujourd'hui
    return {
      state: "A",
      can_spin: true,
      config_mode: "weekdays",
      message: "C'est parti, tourne la roue !",
      last_prize: null,
      wait_info: null,
      frequency_days: null,
      allowed_weekdays: allowedWeekdays,
      require_google_review: !!wheel.require_google_review,
    };
  }

  // Fallback safe : on ne devrait jamais arriver ici, config_mode check exhaustif
  return {
    state: "E",
    can_spin: false,
    config_mode: configMode,
    message:
      "Il n'y a pas de roue prévue pour l'instant. Tu seras prévenu par SMS quand une sera lancée.",
    last_prize: null,
    wait_info: null,
    frequency_days: null,
    allowed_weekdays: [],
    require_google_review: false,
  };
}
