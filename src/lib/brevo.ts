const BREVO_URL = "https://api.brevo.com/v3/transactionalSMS/sms";

export async function sendSMS(to: string, text: string): Promise<boolean> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || apiKey === "placeholder_dev_only") {
    console.log("[brevo] SMS skipped (no API key)", { to, text });
    return false;
  }
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
        recipient: to,
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
