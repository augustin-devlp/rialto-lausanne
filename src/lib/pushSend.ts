import webpush from "web-push";

/**
 * Envoi de notifications push (D5 dashboard).
 * Contrat payload fixé par public/sw.js : { title, body, url, icon?, tag? }.
 * FAIL-FAST : sans les 3 env VAPID, isPushConfigured() = false et les
 * routes répondent « push_not_configured » (jamais de dégradation muette).
 */

export function isPushConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
      process.env.VAPID_PRIVATE_KEY &&
      process.env.VAPID_SUBJECT,
  );
}

let configured = false;
function ensureVapid(): void {
  if (configured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT as string,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
    process.env.VAPID_PRIVATE_KEY as string,
  );
  configured = true;
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

export type PushResult = "sent" | "gone" | "failed";

/**
 * Envoie à UN abonnement. "gone" = endpoint mort (404/410) → l'appelant
 * doit désactiver l'abonnement. Ne throw jamais.
 */
export async function sendToSubscription(
  subscription: unknown,
  payload: PushPayload,
): Promise<PushResult> {
  ensureVapid();
  try {
    await webpush.sendNotification(
      subscription as webpush.PushSubscription,
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";
    console.error("[push] send failed", status, (err as Error).message);
    return "failed";
  }
}
