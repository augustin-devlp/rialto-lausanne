/**
 * Collecte des INTRANTS du moteur ETA (côté serveur uniquement).
 *
 * Le calcul lui-même vit dans ./eta.ts (pur, partagé client/serveur) —
 * ici on ne fait QUE lire la base : heure d'acceptation (trigger
 * order_status_history), compteurs de file et de livraisons en course,
 * minutes de zone, base cuisine.
 *
 * APPROXIMATION ASSUMÉE (cadrage « estimation TRÈS simple ») : la file et
 * l'occupation livreur sont ordonnées/bornées par created_at, proxy de
 * l'heure d'acceptation (l'acceptation suit la création de quelques
 * minutes au volume Rialto). Les compteurs sont bornés par
 * ACTIVE_WINDOW_MIN — sans borne, une commande jamais clôturée (14
 * zombies constatés en base de test) empoisonnerait l'ETA à vie.
 */

import { supabaseService, RESTAURANT_ID } from "@/lib/supabase";
import {
  ACTIVE_WINDOW_MIN,
  IN_COURSE_AFTER_MIN,
  DEFAULT_DELIVERY_PREP_MIN,
  DEFAULT_PICKUP_PREP_MIN,
  DEFAULT_ZONE_MINUTES,
} from "./constants";

export type EtaIntrants = {
  /** ISO — MIN(changed_at) new→accepted du trigger ; null si jamais acceptée. */
  accepted_at: string | null;
  queue_ahead: number;
  in_course: number;
  zone_minutes: number | null;
  prep_base_minutes: number;
  fulfillment_type: "pickup" | "delivery";
};

type Sb = ReturnType<typeof supabaseService>;

async function basePrep(
  sb: Sb,
  fulfillment: "pickup" | "delivery",
): Promise<number> {
  const { data } = await sb
    .from("restaurants")
    .select("pickup_prep_time_minutes, delivery_prep_time_minutes")
    .eq("id", RESTAURANT_ID)
    .maybeSingle();
  const row = data as {
    pickup_prep_time_minutes: number | null;
    delivery_prep_time_minutes: number | null;
  } | null;
  return fulfillment === "pickup"
    ? Number(row?.pickup_prep_time_minutes ?? DEFAULT_PICKUP_PREP_MIN)
    : Number(row?.delivery_prep_time_minutes ?? DEFAULT_DELIVERY_PREP_MIN);
}

async function compteursActifs(
  sb: Sb,
  opts: { avantCreatedAt?: string; exclureOrderId?: string },
): Promise<{ queue_ahead: number; in_course: number }> {
  const borneFenetre = new Date(
    Date.now() - ACTIVE_WINDOW_MIN * 60_000,
  ).toISOString();
  const borneEnCourse = new Date(
    Date.now() - IN_COURSE_AFTER_MIN * 60_000,
  ).toISOString();

  let fileQuery = sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("status", "accepted")
    .gte("created_at", borneFenetre);
  if (opts.avantCreatedAt) {
    fileQuery = fileQuery.lt("created_at", opts.avantCreatedAt);
  }
  if (opts.exclureOrderId) {
    fileQuery = fileQuery.neq("id", opts.exclureOrderId);
  }
  const { count: file } = await fileQuery;

  // ⚠️ Même auto-exclusion que la file : sans elle, une commande de plus
  // de 30 min se comptait ELLE-MÊME comme « livreur en course » et
  // gonflait son propre ETA de +24 min (bloquant relecteur 13.08).
  let enCourseQuery = sb
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("status", "accepted")
    .eq("fulfillment_type", "delivery")
    .gte("created_at", borneFenetre)
    .lt("created_at", borneEnCourse);
  if (opts.exclureOrderId) {
    enCourseQuery = enCourseQuery.neq("id", opts.exclureOrderId);
  }
  const { count: enCourse } = await enCourseQuery;

  return { queue_ahead: file ?? 0, in_course: enCourse ?? 0 };
}

/** Intrants pour UNE commande (page de suivi). */
export async function intrantsPourCommande(
  sb: Sb,
  order: {
    id: string;
    created_at: string;
    status: string;
    fulfillment_type: "pickup" | "delivery";
    delivery_zone_id?: string | null;
  },
): Promise<EtaIntrants> {
  const [acceptation, compteurs, prep] = await Promise.all([
    sb
      .from("order_status_history")
      .select("changed_at")
      .eq("order_id", order.id)
      .eq("old_status", "new")
      .eq("new_status", "accepted")
      .order("changed_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    compteursActifs(sb, {
      avantCreatedAt: order.created_at,
      exclureOrderId: order.id,
    }),
    basePrep(sb, order.fulfillment_type),
  ]);

  let zoneMinutes: number | null = null;
  if (order.fulfillment_type === "delivery" && order.delivery_zone_id) {
    const { data: zone } = await sb
      .from("delivery_zones")
      .select("estimated_delivery_minutes")
      .eq("id", order.delivery_zone_id)
      .maybeSingle();
    zoneMinutes =
      zone?.estimated_delivery_minutes != null
        ? Number(zone.estimated_delivery_minutes)
        : null;
  }

  // Repli d'assurance : si le trigger order_status_history venait à être
  // désactivé (aucune ligne new→accepted alors que le statut est avancé),
  // created_at fait ancre — le suivi DÉGRADE au lieu de geler.
  const acceptedAt =
    (acceptation.data as { changed_at: string } | null)?.changed_at ?? null;
  const statutAvance = order.status !== "new" && order.status !== "cancelled";

  return {
    accepted_at: acceptedAt ?? (statutAvance ? order.created_at : null),
    queue_ahead: compteurs.queue_ahead,
    in_course: compteurs.in_course,
    zone_minutes: zoneMinutes,
    prep_base_minutes: prep,
    fulfillment_type: order.fulfillment_type,
  };
}

/** Intrants pour une ZONE (checkout/menu, avant toute commande). */
export async function intrantsPourZone(
  sb: Sb,
  postalCode: string,
): Promise<EtaIntrants | null> {
  const { data: zone } = await sb
    .from("delivery_zones")
    .select("estimated_delivery_minutes")
    .eq("restaurant_id", RESTAURANT_ID)
    .eq("postal_code", postalCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!zone) return null;

  const [compteurs, prep] = await Promise.all([
    compteursActifs(sb, {}),
    basePrep(sb, "delivery"),
  ]);

  return {
    accepted_at: null,
    queue_ahead: compteurs.queue_ahead,
    in_course: compteurs.in_course,
    zone_minutes: Number(zone.estimated_delivery_minutes ?? DEFAULT_ZONE_MINUTES),
    prep_base_minutes: prep,
    fulfillment_type: "delivery",
  };
}
