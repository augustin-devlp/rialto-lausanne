import { NextRequest, NextResponse } from 'next/server';
import { supabaseService } from '@/lib/supabase';

export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/upsell/track
 * Phase 12 — Tracking des événements upsell (shown / accepted / dismissed).
 * Si dismissed et customer_id, incrémente upsell_dismissals.count → blacklist après 3.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      customer_id?: string | null;
      suggested_item_id: string;
      suggested_category: string;
      action: 'shown' | 'accepted' | 'dismissed' | 'ignored';
      cart_item_ids?: string[];
      score?: number;
      reasons?: string[];
    };

    if (!body.suggested_item_id || !body.action) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const admin = supabaseService();

    const eventInsert = await admin.from('upsell_events').insert({
      customer_id: body.customer_id || null,
      suggested_item_id: body.suggested_item_id,
      suggested_category: body.suggested_category ?? null,
      action: body.action,
      cart_item_ids: body.cart_item_ids || [],
      score: body.score ?? null,
      reasons: body.reasons ?? null,
      created_at: new Date().toISOString(),
    });
    if (eventInsert.error) {
      console.error('[upsell/track] event insert failed', eventInsert.error.message);
    }

    // Dismissal learning : si dismissed et customer connu
    let dismissalDebug: Record<string, unknown> = {};
    if (body.action === 'dismissed' && body.customer_id && body.suggested_category) {
      const { data: existing, error: selectError } = await admin
        .from('upsell_dismissals')
        .select('id, count')
        .eq('customer_id', body.customer_id)
        .eq('category', body.suggested_category)
        .maybeSingle();

      if (selectError) console.error('[upsell/track] dismissal select error', selectError.message);

      if (existing) {
        const upd = await admin
          .from('upsell_dismissals')
          .update({
            count: Number(existing.count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (upd.error) {
          console.error('[upsell/track] dismissal update failed', upd.error.message);
          dismissalDebug = { upd_error: upd.error.message };
        } else {
          dismissalDebug = { updated: true, count: Number(existing.count ?? 0) + 1 };
        }
      } else {
        const ins = await admin
          .from('upsell_dismissals')
          .insert({
            customer_id: body.customer_id,
            category: body.suggested_category,
            count: 1,
          });
        if (ins.error) {
          console.error('[upsell/track] dismissal insert failed', ins.error.message);
          dismissalDebug = { ins_error: ins.error.message };
        } else {
          dismissalDebug = { inserted: true, count: 1 };
        }
      }
    }

    return NextResponse.json({ ok: true, dismissal: dismissalDebug });
  } catch (err) {
    console.error('[upsell/track]', err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
