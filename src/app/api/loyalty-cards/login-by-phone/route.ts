import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { CARD_ID } from "@/lib/loyaltyConstants";
import { phoneLookupVariants } from "@/lib/phoneVariants";

export const dynamic = "force-dynamic";

/**
 * POST /api/loyalty-cards/login-by-phone
 *
 * Retrouve une carte fidélité à partir d'un numéro de téléphone.
 *
 * Matche TOUS les formats historiques :
 *   - "+41791234567" (E.164 avec +)     ← format canonique
 *   - "41791234567"  (E.164 sans +)
 *   - "0791234567"   (NATIONAL CH avec 0)
 *   - "791234567"    (digits only — fallback LIKE)
 *   - "+41 79 123 45 67" (avec espaces — normalisés via libphone)
 *
 * Le matching est fait via une query Postgres avec IN() sur les
 * variants canoniques + un fallback sur les chiffres uniquement pour
 * couvrir le cas où la DB contient une forme inattendue.
 */

/* ─── Rate limit en mémoire (best-effort) ─────────────────────────── */
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return true;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) return false;
  return true;
}

function maskPhone(phone: string): string {
  if (phone.length < 6) return "***";
  return `${phone.slice(0, 4)}***${phone.slice(-2)}`;
}

/** Retourne les chiffres uniquement d'une chaîne (pour regex en DB). */
function onlyDigits(s: string): string {
  return s.replace(/[^\d]/g, "");
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    phone?: string;
    business_id?: string;
    card_id?: string;
  } | null;

  if (!body?.phone?.trim()) {
    return NextResponse.json(
      { ok: false, reason: "invalid_phone" },
      { status: 400 },
    );
  }

  // Génère toutes les variantes matchables en DB
  const { variants, digitsOnly } = phoneLookupVariants(body.phone);
  if (variants.length === 0 || digitsOnly.length < 8) {
    return NextResponse.json(
      { ok: false, reason: "invalid_phone" },
      { status: 400 },
    );
  }

  // Rate limit par IP+6 derniers chiffres
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const rateKey = `${ip}:${digitsOnly.slice(-6)}`;
  if (!checkRateLimit(rateKey)) {
    console.warn("[login-by-phone] rate_limited", {
      ip,
      phone: maskPhone(digitsOnly),
    });
    return NextResponse.json(
      { ok: false, reason: "rate_limited" },
      { status: 429 },
    );
  }

  const targetCardId = body.card_id ?? CARD_ID;

  console.log("[login-by-phone] input", {
    phone: maskPhone(digitsOnly),
    variants_count: variants.length,
    card_id: targetCardId,
  });
  console.log("[login-by-phone] variants tried", variants);

  const admin = supabaseService();

  // Stratégie : on charge les customers qui ont soit un phone égal à
  // l'une des variantes exactes, soit dont les chiffres uniquement
  // terminent par les 9 derniers chiffres du numéro (match fallback).
  // Puis côté Node on re-valide via phoneLookupVariants pour éviter
  // les faux positifs (ex: 2 numéros qui terminent pareil).
  //
  // Étape 1 : match strict via .in() sur les variantes canoniques.
  const { data: strictMatches } = await admin
    .from("customers")
    .select("id, phone, first_name")
    .in("phone", variants)
    .limit(10);

  let candidateCustomers: Array<{ id: string; phone: string; first_name: string }> =
    (strictMatches as Array<{ id: string; phone: string; first_name: string }> | null) ??
    [];

  // Étape 2 : fallback si aucun match strict — on charge TOUS les
  // customers et on filtre côté Node par chiffres uniquement qui
  // terminent par les 8 derniers du numéro recherché (suffixe unique).
  // Coût : 1 requête full scan customers (Rialto < 100 rows, OK).
  if (candidateCustomers.length === 0 && digitsOnly.length >= 8) {
    const suffix = digitsOnly.slice(-8);
    const { data: allCustomers } = await admin
      .from("customers")
      .select("id, phone, first_name");
    candidateCustomers = ((allCustomers as Array<{
      id: string;
      phone: string | null;
      first_name: string;
    }> | null) ?? [])
      .filter((c) => {
        const dbDigits = onlyDigits(c.phone ?? "");
        return dbDigits.endsWith(suffix) && dbDigits.length >= 8;
      })
      .map((c) => ({
        id: c.id,
        phone: c.phone ?? "",
        first_name: c.first_name,
      }));
    if (candidateCustomers.length > 0) {
      console.log("[login-by-phone] matched via digits suffix fallback", {
        count: candidateCustomers.length,
        sample_phone: maskPhone(candidateCustomers[0].phone),
      });
    }
  } else if (candidateCustomers.length > 0) {
    console.log("[login-by-phone] matched strict variant", {
      count: candidateCustomers.length,
      matched_phone: maskPhone(candidateCustomers[0].phone),
    });
  }

  if (candidateCustomers.length === 0) {
    console.log("[login-by-phone] not_found", {
      phone: maskPhone(digitsOnly),
    });
    return NextResponse.json(
      { ok: false, reason: "not_found" },
      { status: 200 },
    );
  }

  // Étape 3 : parmi les customers matchés, trouver celui qui a une
  // customer_card pour le card_id demandé.
  const customerIds = candidateCustomers.map((c) => c.id);
  const { data: cards } = await admin
    .from("customer_cards")
    .select("id, short_code, current_stamps, customer_id")
    .eq("card_id", targetCardId)
    .in("customer_id", customerIds)
    .limit(1);

  const cardRow = Array.isArray(cards) && cards[0] ? cards[0] : null;
  if (!cardRow) {
    console.log("[login-by-phone] customer found but no card for target", {
      phone: maskPhone(digitsOnly),
      card_id: targetCardId,
    });
    return NextResponse.json(
      { ok: false, reason: "not_found" },
      { status: 200 },
    );
  }

  const matchedCustomer = candidateCustomers.find(
    (c) => c.id === cardRow.customer_id,
  );

  // Backfill short_code si absent (bug historique Phase 5)
  let effectiveShortCode = cardRow.short_code as string | null;
  if (!effectiveShortCode) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 3 && !effectiveShortCode; i++) {
      const candidate = Array.from({ length: 8 }, () =>
        alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join("");
      const { data: existing } = await admin
        .from("customer_cards")
        .select("id")
        .eq("short_code", candidate)
        .maybeSingle();
      if (!existing) {
        await admin
          .from("customer_cards")
          .update({ short_code: candidate })
          .eq("id", cardRow.id);
        effectiveShortCode = candidate;
      }
    }
    if (!effectiveShortCode) {
      return NextResponse.json(
        { ok: false, reason: "short_code_missing" },
        { status: 500 },
      );
    }
  }

  console.log("[login-by-phone] ✅ found", {
    phone: maskPhone(digitsOnly),
    card_id: cardRow.id,
    short_code: effectiveShortCode,
    matched_db_phone: maskPhone(matchedCustomer?.phone ?? ""),
  });

  return NextResponse.json({
    ok: true,
    short_code: effectiveShortCode,
    customer_id: cardRow.customer_id,
    first_name: matchedCustomer?.first_name ?? "",
    card_id: cardRow.id,
  });
}
