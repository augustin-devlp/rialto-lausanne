import { NextRequest, NextResponse } from 'next/server';
import { supabaseService, RESTAURANT_ID } from '@/lib/supabase';
import { getFreeDeliveryMilestone } from '@/lib/delivery/milestones';
import { toFreeDeliveryRule } from '@/lib/delivery/rule';
import { generateUpsell } from '@/lib/upsell';
import { buildContext } from '@/lib/upsell/contextBuilder';
import { fetchFullMenu } from '@/lib/upsell/supabaseMenu';
import type {
  EcartMinimum,
  MenuItemFull,
  PalierLivraison,
} from '@/lib/upsell/types';

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
      /** Code postal de l'adresse qualifiée. Sert UNIQUEMENT à résoudre la
       *  zone SERVEUR pour le chemin P2 (palier de livraison offerte).
       *  ⚠️ On ne reçoit PAS les frais ni le seuil : ils sont relus en base.
       *  Un montant qui s'affiche au client ne se croit jamais sur parole. */
      postal_code?: string;
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

    // ═══ PALIER DE LIVRAISON OFFERTE (chemin P2) ═══════════════════════
    // Résolu ICI, côté serveur, à partir du seul code postal : on relit la
    // zone et la règle en base, puis on passe par `getFreeDeliveryMilestone`
    // — LA dérivation unique du seuil (src/lib/delivery/milestones.ts).
    // Aucune formule n'est recopiée, aucun montant n'est cru du client.
    // Null si : pas d'adresse, zone à frais nul, ou toggle coupé — le
    // chemin P2 se tait alors, et les autres chemins reprennent.
    let palierLivraison: PalierLivraison | null = null;
    let ecartMinimum: EcartMinimum | null = null;
    if (body.postal_code) {
      const [zoneRes, restoRes] = await Promise.all([
        admin
          .from("delivery_zones")
          .select("min_order_amount, delivery_fee")
          .eq("restaurant_id", RESTAURANT_ID)
          .eq("postal_code", body.postal_code.trim())
          .eq("is_active", true)
          .maybeSingle(),
        admin
          .from("restaurants")
          .select("free_delivery_threshold, free_delivery_enabled")
          .eq("id", RESTAURANT_ID)
          .maybeSingle(),
      ]);
      const zone = zoneRes.data
        ? {
            min_order_amount: Number(zoneRes.data.min_order_amount),
            delivery_fee: Number(zoneRes.data.delivery_fee),
          }
        : null;
      const jalon = getFreeDeliveryMilestone(
        cart.reduce((n, i) => n + i.price * (i.quantity ?? 1), 0),
        zone,
        toFreeDeliveryRule(restoRes.data ?? null),
      );
      if (jalon && !jalon.reached && zone) {
        palierLivraison = {
          remaining: jalon.remaining,
          delivery_fee: zone.delivery_fee,
        };
      }
      // Écart au MINIMUM de la zone (chemin P7). Rien à voir avec le
      // palier de gratuité : ici la commande est REFUSÉE tant que le
      // minimum n'est pas atteint. Arrondi au centime supérieur, comme
      // `getFreeDeliveryMilestone` — un résidu flottant ne doit jamais
      // afficher « ajoutez 0.00 ».
      if (zone) {
        const sousTotal = cart.reduce(
          (n, i) => n + i.price * (i.quantity ?? 1),
          0,
        );
        if (sousTotal < zone.min_order_amount) {
          ecartMinimum = {
            remaining: Math.max(
              0.01,
              Math.ceil(
                Math.round((zone.min_order_amount - sousTotal) * 10000) / 100,
              ) / 100,
            ),
            minimum: zone.min_order_amount,
          };
        }
      }
    }

    const result = await generateUpsell(cart, {
      ...context,
      palierLivraison,
      ecartMinimum,
    });

    // ⚠️ ON JOURNALISE LE CHEMIN. Le champ `chemin` était écrit sur chaque
    // suggestion avec le commentaire « c'est la seule chose qui rendra la
    // correction possible dans trois mois » — et il n'était LU par personne.
    // Il traversait le JSON et mourait dans le navigateur. Une garantie
    // écrite sans la ligne qui la tient est un claim faux : la voici.
    const premiere = result.suggestions?.[0];
    console.log(
      "[upsell] chemin=" + (premiere?.chemin ?? "scoreur") +
        " panier=" + (body.cart_items?.length ?? 0) +
        " suggestion=" + (premiere?.name ?? "aucune"),
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[upsell] route error', err);
    return NextResponse.json(
      { ok: false, suggestions: [], error: 'upsell_failed' },
      { status: 200 }, // 200 pour ne jamais casser le checkout
    );
  }
}
