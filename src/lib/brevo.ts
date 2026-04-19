const BREVO_URL = "https://api.brevo.com/v3/transactionalSMS/sms";

/**
 * Normalise un numéro suisse pour Brevo (format international sans "+").
 */
export function normalizePhone(raw: string): string {
  let n = raw.replace(/[\s\-().]/g, "");
  if (n.startsWith("+")) return n.slice(1);
  if (n.startsWith("00")) return n.slice(2);
  if (/^0[1-9]\d{8}$/.test(n)) return "41" + n.slice(1);
  if (n.startsWith("0")) return "41" + n.slice(1);
  return n;
}

export async function sendSMS(to: string, text: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || apiKey === "placeholder_dev_only") {
    console.log("[brevo] SMS skipped (no API key)", { to, text });
    return false;
  }
  const recipient = normalizePhone(to);
  try {
    const res = await fetch(BREVO_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: "Rialto",
        recipient,
        content: text,
        type: "transactional",
      }),
    });
    if (!res.ok) {
      console.error("[brevo] SMS failed", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[brevo] SMS error", err);
    return false;
  }
}
