import { toZurichHHMM } from "./timezone";

/**
 * Email « commande reçue » envoyé au restaurant (D6 dashboard).
 * Contenu : tout ce qu'il faut préparer sans ouvrir le dashboard —
 * items + options + notes cuisine, adresse complète (codes, étage,
 * sonnette), bloc paiement (méthode, billets annoncés, rendu).
 * HTML inline simple (clients mail-safe), pas de dépendance.
 */

type EmailItem = {
  item_name_snapshot: string;
  quantity: number;
  selected_options: { name: string; extra_price?: number }[];
  subtotal: number;
  notes: string | null;
};

type EmailOrder = {
  order_number: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  requested_pickup_time: string | null;
  fulfillment_type: "pickup" | "delivery";
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  delivery_instructions: string | null;
  housing_type: "house" | "apartment" | null;
  entry_code_1: string | null;
  entry_code_2: string | null;
  floor: string | null;
  apartment_number: string | null;
  doorbell_name: string | null;
  payment_method: "card" | "cash" | "twint" | null;
  payment_card_timing: "on_delivery" | "remote" | null;
  payment_cash_bills: number | null;
  notes: string | null;
};

function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function chf(n: number): string {
  return `${n.toFixed(2)} CHF`;
}

export function buildOrderEmail(params: {
  order: EmailOrder;
  items: EmailItem[];
}): { subject: string; html: string; text: string } {
  const { order, items } = params;
  const time = order.requested_pickup_time
    ? toZurichHHMM(new Date(order.requested_pickup_time))
    : "dès que possible";
  const mode =
    order.fulfillment_type === "delivery" ? "LIVRAISON" : "RETRAIT";

  const subject = `Nouvelle commande ${order.order_number} — ${mode} ${time} — ${chf(Number(order.total_amount))}`;

  // ── Bloc paiement ──
  let paiement = "Paiement sur place (non précisé)";
  if (order.payment_method === "cash") {
    const donne = order.payment_cash_bills
      ? chf(Number(order.payment_cash_bills))
      : "montant non précisé";
    const rendu =
      order.payment_cash_bills != null
        ? Number(order.payment_cash_bills) - Number(order.total_amount)
        : null;
    paiement =
      `ESPÈCES — le client donnera ${donne}` +
      (rendu != null && rendu > 0
        ? ` → préparer ${chf(rendu)} de rendu`
        : rendu === 0
          ? " (compte juste)"
          : "");
  } else if (order.payment_method === "card") {
    paiement =
      order.payment_card_timing === "remote"
        ? "CARTE À DISTANCE — envoyer le lien de paiement au client"
        : "CARTE au livreur — prendre le terminal";
  } else if (order.payment_method === "twint") {
    paiement = "TWINT au livreur — QR code";
  }

  // ── Bloc adresse ──
  const adresseLines: string[] = [];
  if (order.fulfillment_type === "delivery") {
    adresseLines.push(
      `${order.delivery_address ?? ""}, ${order.delivery_postal_code ?? ""} ${order.delivery_city ?? ""}`,
    );
    if (order.housing_type === "apartment") {
      const codes = [order.entry_code_1, order.entry_code_2]
        .filter(Boolean)
        .join(" puis ");
      if (codes) adresseLines.push(`Code(s) : ${codes}`);
      if (order.floor) adresseLines.push(`Étage : ${order.floor}`);
      if (order.apartment_number)
        adresseLines.push(`Porte : ${order.apartment_number}`);
      if (order.doorbell_name)
        adresseLines.push(`Sonnette : ${order.doorbell_name}`);
    }
    if (order.delivery_instructions)
      adresseLines.push(`Instructions : ${order.delivery_instructions}`);
  }

  // ── Items ──
  const itemsHtml = items
    .map((it) => {
      const opts =
        it.selected_options.length > 0
          ? `<br><span style="color:#6b7280;font-size:12px">${esc(
              it.selected_options.map((o) => `+ ${o.name}`).join(" · "),
            )}</span>`
          : "";
      const note = it.notes
        ? `<br><span style="color:#C73E1D;font-size:12px;font-style:italic">« ${esc(it.notes)} »</span>`
        : "";
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top">${it.quantity}×</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(it.item_name_snapshot)}${opts}${note}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${chf(Number(it.subtotal))}</td>
      </tr>`;
    })
    .join("");

  const itemsText = items
    .map(
      (it) =>
        `  ${it.quantity}x ${it.item_name_snapshot}` +
        (it.selected_options.length
          ? ` (${it.selected_options.map((o) => o.name).join(", ")})`
          : "") +
        (it.notes ? ` « ${it.notes} »` : "") +
        ` — ${chf(Number(it.subtotal))}`,
    )
    .join("\n");

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#C73E1D;color:#fff;padding:14px 18px;border-radius:10px 10px 0 0">
    <div style="font-size:18px;font-weight:bold">Nouvelle commande ${esc(order.order_number)}</div>
    <div style="font-size:13px;opacity:.9">${mode} · ${esc(time)} · ${chf(Number(order.total_amount))}</div>
  </div>
  <div style="border:1px solid #e8e3d8;border-top:0;border-radius:0 0 10px 10px;padding:16px 18px">
    <p style="margin:0 0 4px"><strong>${esc(order.customer_name)}</strong> · ${esc(order.customer_phone)}</p>
    ${
      adresseLines.length
        ? `<p style="margin:8px 0;padding:10px;background:#f9f1e4;border-radius:8px;font-size:14px">${adresseLines
            .map((l) => esc(l))
            .join("<br>")}</p>`
        : ""
    }
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:10px 0">
      ${itemsHtml}
      <tr>
        <td colspan="2" style="padding:8px;font-weight:bold">TOTAL</td>
        <td style="padding:8px;text-align:right;font-weight:bold;white-space:nowrap">${chf(Number(order.total_amount))}</td>
      </tr>
    </table>
    ${order.notes ? `<p style="margin:8px 0;padding:10px;background:#fdf6e3;border-radius:8px;font-size:13px">Note client : ${esc(order.notes)}</p>` : ""}
    <p style="margin:10px 0 0;padding:10px;background:#f5f5f5;border-radius:8px;font-size:14px"><strong>💰 ${esc(paiement)}</strong></p>
  </div>
</div>`;

  const text = [
    `NOUVELLE COMMANDE ${order.order_number}`,
    `${mode} · ${time} · ${chf(Number(order.total_amount))}`,
    `${order.customer_name} · ${order.customer_phone}`,
    ...adresseLines,
    "",
    itemsText,
    `TOTAL : ${chf(Number(order.total_amount))}`,
    order.notes ? `Note client : ${order.notes}` : "",
    `Paiement : ${paiement}`,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
