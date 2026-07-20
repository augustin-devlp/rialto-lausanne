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

/**
 * Send a transactional SMS via Brevo REST API.
 *
 * Variante 3-args portée VERBATIM depuis loyalty-cards/src/lib/brevo.ts.
 * Contrairement à sendSMS() ci-dessus (cascade interne, retourne bool),
 * cette version prend un `sender` explicite et THROW en cas d'échec avec
 * une erreur enrichie (`response.status`, `response.data`) — la cascade
 * de senders et la détection "crédits épuisés" sont gérées par l'appelant
 * (route rialto/loyalty/signup).
 *
 * @param to  Recipient phone — will be normalized to Brevo format (no +, e.g. "33612345678")
 * @param content  SMS text (max 160 chars for a single SMS)
 * @param sender  Alphanumeric 11-char max sender ID. Defaults to "Stampify".
 */
export async function sendSms(
  to: string,
  content: string,
  sender: string = "Stampify",
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  console.log("[brevo] BREVO_API_KEY present:", !!apiKey);

  if (!apiKey) throw new Error("BREVO_API_KEY is not set");

  const recipient = normalizePhone(to);
  console.log(
    "[brevo] sending SMS to recipient:",
    recipient,
    "| sender:",
    sender,
    "| content length:",
    content.length,
  );

  const payload = {
    sender,
    recipient,
    content,
    type: "transactional",
  };

  const res = await fetch("https://api.brevo.com/v3/transactionalSMS/sms", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  console.log("[brevo] SMS API response status:", res.status, "| body:", responseText);

  if (!res.ok) {
    // Enrichit l'erreur avec le status + parsed body pour que le catch
    // appelant puisse inspecter response.data.code, response.status, etc.
    // (détection credits exhausted notamment).
    const err = new Error(
      `Brevo SMS error (${res.status}): ${responseText}`,
    ) as Error & {
      response?: { status: number; data?: Record<string, unknown> };
      responseBody?: string;
    };
    err.responseBody = responseText;
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      err.response = { status: res.status, data: parsed };
    } catch {
      err.response = { status: res.status, data: { raw: responseText } };
    }
    throw err;
  }
}

/* ─── Email transactionnel (D6 dashboard) ────────────────────────────── */

const BREVO_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";

/**
 * Envoie un email transactionnel via Brevo (même BREVO_API_KEY que les SMS).
 * Fire-and-forget côté appelant : retourne false en cas d'échec, ne throw
 * jamais. Sender : BREVO_SENDER_EMAIL (défaut noreply@stampify.ch — domaine
 * DKIM-validé chez Brevo à l'époque Stampify ; à migrer vers un domaine
 * Rialto/Servato validé le jour venu).
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || apiKey === "placeholder_dev_only") {
    console.log("[brevo] email skipped (no API key)", { to: params.to });
    return false;
  }
  try {
    const res = await fetch(BREVO_EMAIL_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: {
          email: process.env.BREVO_SENDER_EMAIL ?? "noreply@stampify.ch",
          name: process.env.BREVO_SENDER_NAME ?? "Rialto",
        },
        to: [{ email: params.to }],
        subject: params.subject,
        htmlContent: params.html,
        ...(params.text ? { textContent: params.text } : {}),
      }),
    });
    if (!res.ok) {
      const raw = await res.text();
      console.error("[brevo] email failed", res.status, raw.slice(0, 300));
      return false;
    }
    const data = (await res.json().catch(() => ({}))) as {
      messageId?: string;
    };
    console.log("[brevo] email sent", { to: params.to, id: data.messageId });
    return true;
  } catch (err) {
    console.error("[brevo] email exception", err);
    return false;
  }
}
