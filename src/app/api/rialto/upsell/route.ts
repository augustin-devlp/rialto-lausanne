import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase';
import { generateUpsell } from '@/lib/upsell';
import { buildContext } from '@/lib/upsell/contextBuilder';
import { fetchFullMenu } from '@/lib/upsell/supabaseMenu';
import type { MenuItemFull } from '@/lib/upsell/types';

export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/upsell
 * Body: { cart_items: [{ menu_item_id, quantity }], customer_id?: string }
 *
 * Phase 12 — Orchestrateur upsell monstre : panier → analyze → candidates → score → Gemini → suggestions.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      cart_items?: Array<{ menu_item_id: string; quantity: number }>;
      customer_id?: string;
    } | null;

    if (!body?.cart_items) {
      return NextResponse.json({ ok: true, suggestions: [] });
    }

    const menu = await fetchFullMenu();
    const menuById = new Map(menu.map((m) => [m.id, m]));

    // Hydrate cart items from menu full data
    const cart: MenuItemFull[] = [];
    for (const ci of body.cart_items) {
      const full = menuById.get(ci.menu_item_id);
      if (full) cart.push({ ...full, quantity: ci.quantity || 1 });
    }

    const admin = supabaseService();
    const context = await buildContext({
      customerId: body.customer_id,
      supabase: admin,
    });

    const result = await generateUpsell(cart, context);

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[upsell] route error', err);
    return NextResponse.json(
      { ok: false, suggestions: [], error: 'upsell_failed' },
      { status: 200 }, // 200 pour ne jamais casser le checkout
    );
  }
}
