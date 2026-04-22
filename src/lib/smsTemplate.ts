import { supabaseService } from "./supabase";
import { toZurichHHMM } from "./timezone";

const DEFAULT_CONFIRMATION =
  "Rialto confirme votre commande {{order_number}}. Heure de retrait prévue : {{pickup_time}}. Suivi : {{order_url}}";

/** Récupère le template personnalisé (ou retourne le contenu par défaut). */
export async function getConfirmationTemplate(
  restaurantId: string,
): Promise<{ content: string; enabled: boolean }> {
  const sb = supabaseService();
  const { data } = await sb
    .from("sms_templates")
    .select("content, enabled")
    .eq("restaurant_id", restaurantId)
    .eq("template_key", "order_confirmation")
    .maybeSingle();
  if (!data) return { content: DEFAULT_CONFIRMATION, enabled: true };
  return { content: data.content as string, enabled: !!data.enabled };
}

/** Remplit les variables {{…}} à partir d'un contexte simple. */
export function renderConfirmationTemplate(
  content: string,
  ctx: {
    order_number: string;
    pickup_time: string;
    customer_name: string;
    total: string;
    order_url: string;
    restaurant_name: string;
    restaurant_phone: string;
    restaurant_address: string;
    reason?: string;
  },
): string {
  return content
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) => {
      const v = (ctx as Record<string, string | undefined>)[key.toLowerCase()];
      return (v ?? "").trim();
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function buildConfirmationContext(params: {
  order: {
    id: string;
    order_number: string;
    customer_name: string;
    total_amount: number;
    requested_pickup_time: string;
  };
  restaurant: { name: string; phone: string | null; address: string | null };
  siteUrl: string;
}): Parameters<typeof renderConfirmationTemplate>[1] {
  const firstName = params.order.customer_name.split(" ")[0] ?? "";
  return {
    order_number: params.order.order_number,
    pickup_time: toZurichHHMM(params.order.requested_pickup_time),
    customer_name: firstName,
    total: params.order.total_amount.toFixed(2),
    // Phase 7 FIX 2 : /confirmation/[orderNumber] (nouveau flow) au lieu
    // de /order/[id] (ancien flow qui pointait parfois vers un vieux
    // site Just Eat chez certains clients)
    order_url: `${params.siteUrl.replace(/\/$/, "")}/confirmation/${params.order.order_number}`,
    restaurant_name: params.restaurant.name,
    restaurant_phone: params.restaurant.phone ?? "",
    restaurant_address: params.restaurant.address ?? "",
  };
}
