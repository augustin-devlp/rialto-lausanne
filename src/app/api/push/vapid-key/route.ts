import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/push/vapid-key
 * Retourne la clé publique VAPID pour que les clients puissent souscrire
 * aux notifications push.
 */
export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;
  return NextResponse.json({ key, configured: Boolean(key) });
}
