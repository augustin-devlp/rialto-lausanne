import { NextRequest, NextResponse } from "next/server";
import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import { normalizePhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/referrals/claim
 * Body: { code: string, phone: string }
 *
 * Phase 11 C9 — Un filleul saisit un code de parrainage + son phone.
 * On crée une ligne referral en statut 'claimed' (pas encore récompensé
 * tant que la 1re commande n'est pas passée). La récompense est déclenchée
 * par le cron /api/cron/reward-referrals après la 1re commande acceptée.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    phone?: string;
  } | null;

  if (!body?.code || !body?.phone) {
    return NextResponse.json(
      { error: "code et phone requis" },
      { status: 400 },
    );
  }

  const admin = supabaseService();
  // Repli sur le phone brut ÉPURÉ (chiffres et + uniquement) : un phone
  // avec espaces/virgules casserait le filtre .or() PostgREST du cron
  // reward-referrals → filleul jamais matché, referral jamais récompensé.
  const phoneNorm =
    normalizePhone(body.phone) ?? body.phone.replace(/[^\d+]/g, "");
  if (!phoneNorm) {
    return NextResponse.json({ error: "phone_invalide" }, { status: 400 });
  }

  // Trouver le referral par code (status pending ou claimed)
  const { data: referralPending } = await admin
    .from("referrals")
    .select("id, referrer_customer_id, status, referee_phone")
    .eq("referral_code", body.code.trim().toUpperCase())
    .in("status", ["pending", "claimed"])
    .order("created_at", { ascending: false })
    .limit(1);

  const rowTemplate = referralPending?.[0];
  if (!rowTemplate) {
    return NextResponse.json(
      { error: "code_invalide_ou_expire" },
      { status: 404 },
    );
  }

  // Eviter auto-parrainage : le phone du filleul doit matcher un customer
  // different du referrer
  const { data: allCustomers } = await admin
    .from("customers")
    .select("id, phone");
  const filleulCustomer = (allCustomers ?? []).find(
    (c) => (normalizePhone(c.phone ?? "") ?? c.phone) === phoneNorm,
  );
  if (filleulCustomer && filleulCustomer.id === rowTemplate.referrer_customer_id) {
    return NextResponse.json(
      { error: "auto_parrainage_interdit" },
      { status: 400 },
    );
  }

  // Si un referral existe déjà pour ce phone, ne pas re-créer
  const { data: alreadyRef } = await admin
    .from("referrals")
    .select("id")
    .eq("referee_phone", phoneNorm)
    .in("status", ["claimed", "rewarded"])
    .limit(1);
  if (alreadyRef && alreadyRef.length > 0) {
    return NextResponse.json(
      { error: "phone_deja_parraine" },
      { status: 409 },
    );
  }

  // Créer une nouvelle ligne 'claimed' pour tracker ce filleul
  const { error } = await admin.from("referrals").insert({
    referrer_customer_id: rowTemplate.referrer_customer_id,
    referral_code: body.code.trim().toUpperCase(),
    referee_phone: phoneNorm,
    referee_customer_id: filleulCustomer?.id ?? null,
    restaurant_id: RESTAURANT_ID,
    status: "claimed",
  });

  if (error) {
    return NextResponse.json(
      { error: "save_failed", detail: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      message:
        "Parrainage enregistré. Passe ta 1re commande pour que ton parrain et toi receviez votre pizza Marguerite offerte !",
    },
  );
}
