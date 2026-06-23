import { NextRequest, NextResponse } from "next/server";
import { applyPromoCode, validatePromoCode } from "@/lib/promoCodes";

export const dynamic = "force-dynamic";

/**
 * POST /api/promo-codes/apply
 * Consomme un code promo (atomique) et l'attache à une commande existante.
 *
 * Body : {
 *   code: string,              // code lisible (pas l'id)
 *   order_id: string,
 *   subtotal: number
 * }
 * (business_id éventuellement envoyé par le client est ignoré : le scope
 * serveur est fixé par la constante BUSINESS_ID.)
 *
 * Le code doit passer la validation avant d'être consommé.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    order_id?: string;
    subtotal?: number;
  } | null;

  if (!body?.code || !body.order_id || typeof body.subtotal !== "number") {
    return NextResponse.json(
      { ok: false, error: "code, order_id et subtotal requis" },
      { status: 400 },
    );
  }

  // 1. Re-valider pour récupérer le discount_amount + id
  const validation = await validatePromoCode({
    code: body.code,
    subtotal: body.subtotal,
  });

  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 200 },
    );
  }

  // 2. Appliquer (atomique)
  const applied = await applyPromoCode({
    promo_code_id: validation.code.id,
    order_id: body.order_id,
    discount_amount: validation.discount_amount,
  });

  if (!applied.ok) {
    return NextResponse.json(
      { ok: false, error: applied.error },
      { status: 200 },
    );
  }

  return NextResponse.json({
    ok: true,
    code_id: applied.code.id,
    discount_amount: validation.discount_amount,
    uses_count: applied.code.uses_count,
    max_uses: applied.code.max_uses,
  });
}
