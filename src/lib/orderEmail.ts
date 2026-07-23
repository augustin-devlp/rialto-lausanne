import { toZurichHHMM } from "./timezone";

/**
 * Email de confirmation « commande bien reçue » envoyé au CLIENT (lot E1,
 * 21.07.2026). Un reçu digital que le client garde : récap de sa commande
 * (numéro, plats + options, total, mode, adresse) + lien de suivi.
 *
 * Envoyé à la CRÉATION de la commande (accusé de réception ; le suivi de
 * statut vit sur la page /confirmation). Fire-and-forget côté route : un
 * échec Brevo ne bloque jamais la commande.
 *
 * ⚠️ Ce builder a REMPLACÉ l'ancien email « nouvelle commande » au
 * restaurateur (obsolète depuis que la caisse imprime automatiquement).
 *
 * i18n : FR uniquement en v1 (la locale du checkout n'est stockée nulle
 * part — ajout de orders.locale consigné au lot i18n global). Les libellés
 * sont regroupés dans L ci-dessous : brancher une autre langue = ajouter
 * un dictionnaire et sélectionner selon la locale. Le cœur du reçu (plats,
 * prix, adresse) est neutre.
 */

type EmailItem = {
  item_name_snapshot: string;
  quantity: number;
  selected_options: { name: string; extra_price?: number }[];
  subtotal: number;
  notes: string | null;
};

type CustomerEmailOrder = {
  order_number: string;
  requested_pickup_time: string | null;
  fulfillment_type: "pickup" | "delivery";
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  delivery_fee: number | null;
  payment_method: "card" | "cash" | "twint" | null;
  payment_card_timing: "on_delivery" | "remote" | null;
  total_amount: number;
  /**
   * Remise promo déjà déduite de total_amount (fix 23.07.2026). Affichée en
   * ligne dédiée pour que items + livraison − remise = total sous les yeux
   * du client — sans elle, le reçu semblerait faux.
   */
  promo_discount_amount?: number | null;
  promo_code?: string | null;
  notes: string | null;
};

type EmailRestaurant = {
  name: string;
  address: string | null;
  phone: string | null;
};

// Libellés FR (point d'extension i18n — cf. docstring).
const L = {
  received: "Votre commande est bien reçue",
  intro:
    "Merci pour votre commande ! Voici votre récapitulatif. Nous la préparons dès sa validation par le restaurant.",
  orderNo: "Commande",
  when: "Pour",
  asap: "dès que possible",
  delivery: "Livraison",
  pickup: "Retrait",
  deliveryTo: "Livraison à",
  pickupAt: "À retirer chez",
  deliveryFee: "Frais de livraison",
  promo: "Remise",
  total: "Total",
  yourNote: "Votre note",
  // Libellé neutre « Paiement » (pas « sur place ») : le mode carte à
  // distance = lien envoyé par le restaurant, qui n'est pas un règlement
  // sur place — chaque valeur ci-dessous porte sa propre précision.
  payment: "Paiement",
  pay_cash: "Espèces, à régler sur place",
  pay_twint: "TWINT, à régler sur place",
  pay_card: "Carte, au livreur",
  pay_card_remote: "Carte — lien de paiement envoyé par le restaurant",
  pay_unset: "à régler sur place",
  track: "Suivre ma commande",
  footer:
    "Un souci avec votre commande ? Appelez-nous directement, nous sommes là.",
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

export function buildCustomerOrderEmail(params: {
  order: CustomerEmailOrder;
  items: EmailItem[];
  restaurant: EmailRestaurant;
  siteUrl: string;
}): { subject: string; html: string; text: string } {
  const { order, items, restaurant, siteUrl } = params;
  const time = order.requested_pickup_time
    ? toZurichHHMM(new Date(order.requested_pickup_time))
    : L.asap;
  const isDelivery = order.fulfillment_type === "delivery";
  const modeLabel = isDelivery ? L.delivery : L.pickup;
  const deliveryFee = Number(order.delivery_fee ?? 0);

  const subject = `Rialto — votre commande ${order.order_number} est bien reçue`;

  const trackUrl = `${siteUrl.replace(/\/$/, "")}/confirmation/${encodeURIComponent(
    order.order_number,
  )}`;

  // ── Règlement (client, SANS calcul de rendu — c'était pour le resto) ──
  let paiement: string;
  if (order.payment_method === "cash") paiement = L.pay_cash;
  else if (order.payment_method === "twint") paiement = L.pay_twint;
  else if (order.payment_method === "card")
    paiement =
      order.payment_card_timing === "remote" ? L.pay_card_remote : L.pay_card;
  else paiement = L.pay_unset;

  // ── Adresse (livraison : chez le client ; retrait : chez Rialto) ──
  const addressBlock = isDelivery
    ? [
        order.delivery_address,
        `${order.delivery_postal_code ?? ""} ${order.delivery_city ?? ""}`.trim(),
      ]
        .filter((l) => l && l.trim())
        .join("\n")
    : [restaurant.name, restaurant.address].filter(Boolean).join("\n");
  const addressTitle = isDelivery ? L.deliveryTo : L.pickupAt;

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

  const feeRowHtml =
    deliveryFee > 0
      ? `<tr>
        <td colspan="2" style="padding:6px 8px;color:#6b7280">${L.deliveryFee}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap">${chf(deliveryFee)}</td>
      </tr>`
      : "";

  const promoDiscount = Number(order.promo_discount_amount ?? 0);
  const promoLabel = order.promo_code
    ? `${L.promo} (${order.promo_code})`
    : L.promo;
  const promoRowHtml =
    promoDiscount > 0
      ? `<tr>
        <td colspan="2" style="padding:6px 8px;color:#6b7280">${esc(promoLabel)}</td>
        <td style="padding:6px 8px;text-align:right;white-space:nowrap">−${chf(promoDiscount)}</td>
      </tr>`
      : "";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <div style="background:#C73E1D;color:#fff;padding:16px 18px;border-radius:10px 10px 0 0">
    <div style="font-size:20px;font-weight:bold">Rialto</div>
    <div style="font-size:14px;opacity:.95;margin-top:2px">${L.received}</div>
  </div>
  <div style="border:1px solid #e8e3d8;border-top:0;border-radius:0 0 10px 10px;padding:16px 18px">
    <p style="margin:0 0 12px;font-size:14px;color:#444">${L.intro}</p>
    <p style="margin:0 0 4px;font-size:14px"><strong>${L.orderNo} ${esc(order.order_number)}</strong></p>
    <p style="margin:0 0 12px;font-size:14px;color:#444">${esc(modeLabel)} · ${L.when} ${esc(time)}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:8px 0">
      ${itemsHtml}
      ${feeRowHtml}
      ${promoRowHtml}
      <tr>
        <td colspan="2" style="padding:8px;font-weight:bold">${L.total}</td>
        <td style="padding:8px;text-align:right;font-weight:bold;white-space:nowrap">${chf(Number(order.total_amount))}</td>
      </tr>
    </table>
    ${
      addressBlock
        ? `<p style="margin:10px 0;padding:10px;background:#f9f1e4;border-radius:8px;font-size:14px"><strong>${addressTitle}</strong><br>${esc(
            addressBlock,
          ).replace(/\n/g, "<br>")}</p>`
        : ""
    }
    ${order.notes ? `<p style="margin:10px 0;padding:10px;background:#fdf6e3;border-radius:8px;font-size:13px"><strong>${L.yourNote} :</strong> ${esc(order.notes)}</p>` : ""}
    <p style="margin:10px 0;font-size:14px"><strong>${L.payment} :</strong> ${esc(paiement)}</p>
    <p style="margin:18px 0 6px;text-align:center">
      <a href="${esc(trackUrl)}" style="display:inline-block;background:#C73E1D;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:bold;font-size:14px">${L.track} →</a>
    </p>
  </div>
  <p style="margin:14px 0 0;text-align:center;font-size:12px;color:#6b7280">
    ${esc(restaurant.name)}${restaurant.address ? ` · ${esc(restaurant.address)}` : ""}${restaurant.phone ? ` · ${esc(restaurant.phone)}` : ""}
    <br>${L.footer}
  </p>
</div>`;

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

  const text = [
    `Rialto — ${L.received}`,
    "",
    L.intro,
    "",
    `${L.orderNo} ${order.order_number}`,
    `${modeLabel} · ${L.when} ${time}`,
    "",
    itemsText,
    deliveryFee > 0 ? `${L.deliveryFee} : ${chf(deliveryFee)}` : "",
    promoDiscount > 0 ? `${promoLabel} : −${chf(promoDiscount)}` : "",
    `${L.total} : ${chf(Number(order.total_amount))}`,
    addressBlock ? `\n${addressTitle} :\n${addressBlock}` : "",
    order.notes ? `${L.yourNote} : ${order.notes}` : "",
    `${L.payment} : ${paiement}`,
    "",
    `${L.track} : ${trackUrl}`,
    "",
    `${restaurant.name}${restaurant.address ? ` · ${restaurant.address}` : ""}${restaurant.phone ? ` · ${restaurant.phone}` : ""}`,
    L.footer,
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { subject, html, text };
}
