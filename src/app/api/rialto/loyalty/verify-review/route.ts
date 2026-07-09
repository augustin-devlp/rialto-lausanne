import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import {
  BUSINESS_ID,
  SPIN_WHEEL_ID,
  RIALTO_PLACE_ID,
} from "@/lib/loyaltyConstants";

export const dynamic = "force-dynamic";

type GoogleReview = {
  relativePublishTimeDescription?: string;
  rating?: number;
  publishTime?: string;
  authorAttribution?: {
    displayName?: string;
    uri?: string;
    photoUri?: string;
  };
};

/**
 * Convertit la frequency d'une roue en millisecondes de validité.
 */
function frequencyToMs(frequency: string | null | undefined): number {
  switch (frequency) {
    case "daily":
      return 24 * 60 * 60 * 1000;
    case "weekly":
      return 7 * 24 * 60 * 60 * 1000;
    case "monthly":
      return 30 * 24 * 60 * 60 * 1000;
    case "once":
      return Number.MAX_SAFE_INTEGER; // un seul claim à vie
    default:
      return 7 * 24 * 60 * 60 * 1000;
  }
}

/**
 * POST /api/rialto/loyalty/verify-review
 * Body: { customer_id }
 *
 * Vérifie qu'un avis Google récent (< 30 min) existe pour ce business et
 * le "claim" pour ce customer. Un seul avis = roue + loterie débloquées
 * jusqu'à expires_at.
 *
 * Réponses :
 *   200 { ok: true, claim: {...}, reason: 'existing-claim' | 'new-claim' }
 *   200 { ok: false, reason: 'no-recent-review' | 'already-claimed' | 'api-missing' }
 *   400 { error: ... }
 */
/** Fenêtre de tolérance entre le moment où un avis Google est publié et
 * le moment où le client clique "J'ai laissé mon avis". 2 minutes c'est
 * trop court : Google peut mettre 5-20 min à propager un avis sur son API
 * même avec cache:no-store (le CDN Places garde souvent l'ancienne liste).
 * On élargit à 30 min. */
const WINDOW_MS = 30 * 60 * 1000;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    customer_id?: string;
  } | null;
  if (!body?.customer_id) {
    return NextResponse.json(
      { error: "customer_id requis" },
      { status: 400 },
    );
  }

  const diag = {
    customer_id: body.customer_id,
    business_id: BUSINESS_ID,
    started_at: new Date().toISOString(),
  };
  console.log("[verify-review] START", diag);

  const admin = supabaseService();

  // 1) Check claim actif (expires_at > now) pour ce customer
  const nowIso = new Date().toISOString();
  const { data: existing } = await admin
    .from("google_review_claims")
    .select("id, review_author_name, claimed_at, expires_at")
    .eq("customer_id", body.customer_id)
    .eq("business_id", BUSINESS_ID)
    .gt("expires_at", nowIso)
    .order("claimed_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    console.log("[verify-review] existing claim found", {
      ...diag,
      claim_id: existing[0].id,
      expires_at: existing[0].expires_at,
    });
    return NextResponse.json({
      ok: true,
      claim: existing[0],
      reason: "existing-claim",
    });
  }

  // 2) Besoin d'un nouvel avis → Google Places
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = RIALTO_PLACE_ID; // D3 : constante uniquement, plus de table businesses

  console.log("[verify-review] env check", {
    api_key_present: !!apiKey,
    place_id: placeId,
  });

  if (!apiKey) {
    console.error(
      "[verify-review] ❌ GOOGLE_PLACES_API_KEY missing — impossible de vérifier l'avis",
    );
    return NextResponse.json(
      {
        ok: false,
        reason: "api-missing",
        user_message:
          "La vérification d'avis est temporairement indisponible. Contactez le restaurant pour débloquer votre tour.",
      },
      { status: 200 },
    );
  }

  if (!placeId) {
    console.error("[verify-review] ❌ place_id missing for business", {
      business_id: BUSINESS_ID,
    });
    return NextResponse.json(
      {
        ok: false,
        reason: "place-id-missing",
        user_message:
          "Configuration Google incomplète. Contactez le restaurant.",
      },
      { status: 200 },
    );
  }

  let reviews: GoogleReview[] = [];
  try {
    const res = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
      {
        method: "GET",
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "reviews",
        },
        // Google Places a un cache CDN — on force frais.
        cache: "no-store",
      },
    );
    if (!res.ok) {
      const text = await res.text();
      console.error("[verify-review] ❌ Google Places error", res.status, text);
      return NextResponse.json(
        {
          ok: false,
          reason: "google-api-error",
          status: res.status,
          user_message: "Impossible de contacter Google. Réessayez dans 1 min.",
        },
        { status: 200 },
      );
    }
    const body2 = (await res.json()) as { reviews?: GoogleReview[] };
    reviews = body2.reviews ?? [];
    console.log("[verify-review] Google returned", {
      total_reviews: reviews.length,
      sample: reviews.slice(0, 3).map((r) => ({
        author: r.authorAttribution?.displayName,
        time: r.publishTime,
        rating: r.rating,
      })),
    });
  } catch (err) {
    console.error("[verify-review] ❌ Google Places fetch failed", err);
    return NextResponse.json(
      {
        ok: false,
        reason: "google-api-error",
        user_message: "Erreur réseau Google. Réessayez dans 1 min.",
      },
      { status: 200 },
    );
  }

  // 3) Filtre les avis dans la fenêtre WINDOW_MS
  const nowMs = Date.now();
  const parsedReviews = reviews.map((r) => ({
    author: r.authorAttribution?.displayName ?? "",
    time: r.publishTime ? new Date(r.publishTime).getTime() : 0,
    rating: r.rating ?? 0,
    publishTime: r.publishTime ?? "",
    age_minutes: r.publishTime
      ? Math.round((nowMs - new Date(r.publishTime).getTime()) / 60000)
      : null,
  }));

  const recentReviews = parsedReviews.filter(
    (r) => r.author && r.time > 0 && nowMs - r.time <= WINDOW_MS,
  );

  console.log("[verify-review] recency filter", {
    window_minutes: WINDOW_MS / 60000,
    parsed: parsedReviews.map((r) => ({
      author: r.author,
      age_minutes: r.age_minutes,
    })),
    recent_count: recentReviews.length,
  });

  if (recentReviews.length === 0) {
    const freshest = parsedReviews
      .filter((r) => r.age_minutes != null)
      .sort((a, b) => (a.age_minutes ?? 0) - (b.age_minutes ?? 0))[0];
    return NextResponse.json(
      {
        ok: false,
        reason: "no-recent-review",
        freshest_age_minutes: freshest?.age_minutes ?? null,
        user_message: freshest?.age_minutes
          ? `Votre avis n'apparaît pas encore chez Google (dernier : il y a ${freshest.age_minutes} min). Attendez 2 min et réessayez.`
          : "Nous n'avons pas encore trouvé votre avis. Attendez 2 min et réessayez.",
      },
      { status: 200 },
    );
  }

  // 4) Essaie de claim chaque avis récent
  // La contrainte UNIQUE (business_id, review_author_name, review_time)
  // garantit qu'un avis ne peut être pris que par un seul customer.
  //
  // expires_at : aligné sur la logique dual-schéma du mode dégradé (D1) —
  // frequency_days (nouveau schéma) si présent, sinon frequencyToMs legacy.
  const { data: wheel } = await admin
    .from("spin_wheels")
    .select("frequency, frequency_days")
    .eq("id", SPIN_WHEEL_ID)
    .maybeSingle();
  const freqMs = wheel?.frequency_days
    ? Number(wheel.frequency_days) * 24 * 60 * 60 * 1000
    : frequencyToMs(wheel?.frequency as string | undefined);
  const expiresAt = new Date(
    Math.min(nowMs + freqMs, nowMs + 365 * 24 * 60 * 60 * 1000),
  ).toISOString();

  for (const r of recentReviews) {
    const { data: inserted, error: insertErr } = await admin
      .from("google_review_claims")
      .insert({
        customer_id: body.customer_id,
        business_id: BUSINESS_ID,
        review_author_name: r.author,
        review_time: r.publishTime,
        expires_at: expiresAt,
      })
      .select("id, review_author_name, claimed_at, expires_at")
      .single();

    if (insertErr) {
      // 23505 = unique_violation → cet avis est déjà claim par quelqu'un
      if (insertErr.code === "23505") {
        console.warn("[verify-review] review déjà claim par un autre customer", {
          author: r.author,
          review_time: r.publishTime,
        });
        continue;
      }
      console.error("[verify-review] ❌ insert failed", insertErr);
      continue;
    }
    if (inserted) {
      console.log("[verify-review] ✅ new claim created", {
        ...diag,
        claim_id: inserted.id,
        author: r.author,
      });
      return NextResponse.json({
        ok: true,
        claim: inserted,
        reason: "new-claim",
      });
    }
  }

  console.warn("[verify-review] all recent reviews already claimed", diag);
  return NextResponse.json(
    {
      ok: false,
      reason: "already-claimed",
      user_message:
        "Cet avis a déjà été utilisé. Laissez-en un nouveau depuis votre compte Google pour débloquer la roue.",
    },
    { status: 200 },
  );
}
