import { toBrevoPhone, normalizePhone as npE164 } from "./phone";

const BREVO_URL = "https://api.brevo.com/v3/transactionalSMS/sms";

/**
 * Normalise un numéro pour Brevo (E.164 sans "+"). Gère CH + FR via
 * libphonenumber-js.
 */
export function normalizePhone(raw: string): string {
  return toBrevoPhone(raw);
}

const PRIMARY_SENDER = "Rialto";
const FALLBACK_SENDER = "Stampify"; // pré-validé chez Brevo → marche FR+CH

function shouldFallback(status: number, data: unknown): boolean {
  if (status !== 400 && status !== 403) return false;
  const msg = JSON.stringify(data).toLowerCase();
  return (
    msg.includes("sender") ||
    msg.includes("expediteur") ||
    msg.includes("unauthorized") ||
    msg.includes("not allowed")
  );
}

export async function sendSMS(to: string, text: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || apiKey === "placeholder_dev_only") {
    console.log("[brevo] SMS skipped (no API key)", { to, text });
    return false;
  }
  const recipient = normalizePhone(to);
  const e164 = npE164(to);
  const isFrench = recipient.startsWith("33");
  if (isFrench) {
    console.log(
      "[brevo] FR number detected — sender Rialto may fail, fallback Stampify ready.",
      { e164, recipient },
    );
  }

  const senders = [PRIMARY_SENDER, FALLBACK_SENDER];
  for (const sender of senders) {
    try {
      const res = await fetch(BREVO_URL, {
        method: "POST",
        headers: {
          "api-key": apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender,
          recipient,
          content: text,
          type: "transactional",
        }),
      });
      if (res.ok) {
        console.log("[brevo] SMS sent", { recipient, sender });
        return true;
      }
      const raw = await res.text();
      let data: unknown = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { rawBody: raw };
      }
      console.error("[brevo] SMS failed", {
        status: res.status,
        sender,
        recipient,
        data,
      });
      if (sender === PRIMARY_SENDER && shouldFallback(res.status, data)) {
        console.warn(
          "[brevo] Retry avec sender Stampify (Rialto refusé par Brevo)",
        );
        continue;
      }
      return false;
    } catch (err) {
      console.error("[brevo] SMS fetch error", err);
      return false;
    }
  }
  return false;
}
