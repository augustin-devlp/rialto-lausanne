import { NextRequest, NextResponse } from "next/server";
import { validatePromoCode } from "@/lib/promoCodes";

export const dynamic = "force-dynamic";

/**
 * POST /api/promo-codes/validate
 * Vérifie qu'un code est valide pour un panier donné SANS le consommer.
 *
 * Body : {
 *   code: string,
 *   subtotal: number
 * }
 * (business_id éventuellement envoyé par le client est ignoré : le scope
 * serveur est fixé par la constante BUSINESS_ID.)
 *
 * Utilisé par la page Checkout pour afficher un feedback en temps réel
 * quand le client tape un code.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as {
    code?: string;
    subtotal?: number;
  } | null;

  if (!body?.code || typeof body.subtotal !== "number") {
    return NextResponse.json(
      { valid: false, error: "code et subtotal requis" },
      { status: 400 },
    );
  }

  const result = await validatePromoCode({
    code: body.code,
    subtotal: body.subtotal,
  });

  if (!result.ok) {
    return NextResponse.json(
      { valid: false, error: result.error },
      { status: 200 }, // 200 : c'est une validation métier, pas une erreur HTTP
    );
  }

  return NextResponse.json({
    valid: true,
    code_id: result.code.id,
    code: result.code.code,
    discount_type: result.code.discount_type,
    discount_value: result.code.discount_value,
    free_item_label: result.code.free_item_label,
    discount_amount: result.discount_amount,
    message: result.message,
    valid_until: result.code.valid_until,
  });
}
