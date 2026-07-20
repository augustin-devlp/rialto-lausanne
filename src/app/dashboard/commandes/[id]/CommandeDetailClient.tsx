"use client";

/**
 * Fiche commande — dashboard patron.
 * Tout ce qu'il faut pour préparer et livrer : items + options + notes,
 * adresse complète (codes, étage, sonnette), bloc paiement (méthode,
 * billets annoncés, rendu à préparer), actions de statut + refus motivé.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { formatCHF } from "@/lib/format";
import {
  STATUS_LABELS,
  statusChipClasses,
  NEXT_ACTION,
} from "@/components/dashboard/orderStatus";

type OrderDetail = {
  id: string;
  order_number: string;
  status: string;
  cancellation_reason: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  total_amount: number;
  notes: string | null;
  created_at: string;
  requested_pickup_time: string | null;
  fulfillment_type: "pickup" | "delivery";
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  delivery_floor_door: string | null;
  delivery_instructions: string | null;
  delivery_fee: number | null;
  housing_type: "house" | "apartment" | null;
  entry_code_1: string | null;
  entry_code_2: string | null;
  floor: string | null;
  apartment_number: string | null;
  doorbell_name: string | null;
  payment_method: "card" | "cash" | "twint" | null;
  payment_card_timing: "on_delivery" | "remote" | null;
  payment_cash_bills: number | null;
  promo_discount_amount: number;
  items: Array<{
    id: string;
    item_name_snapshot: string;
    item_price_snapshot: number;
    quantity: number;
    selected_options: Array<{ group?: string; name: string; extra_price?: number }>;
    subtotal: number;
    notes: string | null;
  }>;
  history: Array<{
    old_status: string | null;
    new_status: string;
    changed_at: string;
    changed_by: string | null;
  }>;
};

export default function CommandeDetailClient({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const body = (await res.json()) as { ok: boolean; order: OrderDetail };
      if (body.ok) setOrder(body.order);
    } catch {
      /* le polling suivant réessaie */
    }
  }, [orderId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  async function changeStatus(status: string, withReason?: string) {
    if (acting) return;
    setActing(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/dashboard/orders/${orderId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, reason: withReason }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) {
        setActionError(
          body.error === "transition_invalide"
            ? "Le statut a changé entre-temps (caisse ?). Fiche rechargée."
            : "Action impossible. Réessayez.",
        );
      }
      setRefusing(false);
      setReason("");
      await load();
    } catch {
      setActionError("Problème de connexion. Réessayez.");
    } finally {
      setActing(false);
    }
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border bg-white p-6 text-center">
        <p className="text-sm text-mute">Commande introuvable.</p>
        <Link
          href="/dashboard/commandes"
          className="mt-3 inline-block text-sm font-semibold text-rialto"
        >
          ← Retour aux commandes
        </Link>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
      </div>
    );
  }

  const nextAction = NEXT_ACTION[order.status];
  const canCancel = ["new", "accepted", "preparing", "ready"].includes(
    order.status,
  );
  const time = order.requested_pickup_time
    ? new Date(order.requested_pickup_time).toLocaleTimeString("fr-CH", {
        timeZone: "Europe/Zurich",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "dès que possible";
  const rendu =
    order.payment_method === "cash" && order.payment_cash_bills
      ? Number(order.payment_cash_bills) - Number(order.total_amount)
      : null;

  return (
    <div className="space-y-4 pb-6">
      <Link
        href="/dashboard/commandes"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"
      >
        ← Commandes
      </Link>

      {/* En-tête */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-xl font-bold text-ink">
            {order.order_number}
          </h1>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${statusChipClasses(order.status)}`}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
        <div className="mt-1 text-sm text-ink/85">
          {order.customer_name} ·{" "}
          <a
            href={`tel:${order.customer_phone}`}
            className="font-medium text-rialto underline-offset-2 hover:underline"
          >
            {order.customer_phone}
          </a>
        </div>
        <div className="mt-0.5 text-xs text-mute">
          {order.fulfillment_type === "delivery" ? "🚴 Livraison" : "🏪 Retrait"}
          {" · "}
          {time}
        </div>
        {order.status === "cancelled" && order.cancellation_reason && (
          <div className="mt-2 rounded-xl bg-ink/5 p-2.5 text-xs text-ink/70">
            Motif du refus (interne) : {order.cancellation_reason}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
          Articles
        </h2>
        <ul className="divide-y divide-border">
          {order.items.map((it) => (
            <li key={it.id} className="py-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold text-ink">
                  {it.quantity}× {it.item_name_snapshot}
                </span>
                <span className="tabular flex-shrink-0 text-sm font-semibold">
                  {formatCHF(Number(it.subtotal))}
                </span>
              </div>
              {it.selected_options.length > 0 && (
                <div className="mt-0.5 text-xs text-mute">
                  {it.selected_options.map((o) => `+ ${o.name}`).join(" · ")}
                </div>
              )}
              {it.notes && (
                <div className="mt-0.5 text-xs italic text-rialto">
                  « {it.notes} »
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
          <span className="text-sm font-semibold text-ink">Total</span>
          <span className="tabular font-display text-base font-bold text-ink">
            {formatCHF(Number(order.total_amount))}
          </span>
        </div>
        {order.notes && (
          <div className="mt-2 rounded-xl bg-saffron/10 p-2.5 text-xs text-ink">
            Note client : {order.notes}
          </div>
        )}
      </div>

      {/* Livraison */}
      {order.fulfillment_type === "delivery" && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
            Livraison
            {order.housing_type === "apartment" && " — Appartement"}
            {order.housing_type === "house" && " — Maison"}
          </h2>
          <p className="text-sm font-medium text-ink">
            {order.delivery_address}
            <br />
            {order.delivery_postal_code} {order.delivery_city}
          </p>
          <dl className="mt-2 space-y-1 text-sm text-ink/85">
            {(order.entry_code_1 || order.entry_code_2) && (
              <div>
                🔑 Code(s) :{" "}
                <strong>
                  {[order.entry_code_1, order.entry_code_2]
                    .filter(Boolean)
                    .join(" puis ")}
                </strong>
              </div>
            )}
            {order.floor && <div>🏢 Étage : {order.floor}</div>}
            {order.apartment_number && (
              <div>🚪 Porte : {order.apartment_number}</div>
            )}
            {order.doorbell_name && (
              <div>🔔 Sonnette : {order.doorbell_name}</div>
            )}
            {order.delivery_floor_door && !order.apartment_number && (
              <div>🏢 Étage/porte : {order.delivery_floor_door}</div>
            )}
          </dl>
          {order.delivery_instructions && (
            <div className="mt-2 rounded-xl bg-cream p-2.5 text-xs italic text-ink/80">
              « {order.delivery_instructions} »
            </div>
          )}
        </div>
      )}

      {/* Paiement */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
          Paiement
        </h2>
        {order.payment_method === "cash" && (
          <p className="text-sm text-ink">
            💵 Espèces — le client donnera{" "}
            <strong>
              {order.payment_cash_bills
                ? formatCHF(Number(order.payment_cash_bills))
                : "un montant non précisé"}
            </strong>
            {rendu !== null && rendu > 0 && (
              <>
                {" "}
                → préparer{" "}
                <strong className="text-rialto">{formatCHF(rendu)}</strong> de
                rendu
              </>
            )}
            {rendu === 0 && " (compte juste)"}
          </p>
        )}
        {order.payment_method === "card" && (
          <p className="text-sm text-ink">
            💳 Carte —{" "}
            {order.payment_card_timing === "remote"
              ? "à distance (lien à envoyer au client)"
              : "au livreur (prendre le terminal)"}
          </p>
        )}
        {order.payment_method === "twint" && (
          <p className="text-sm text-ink">📱 Twint — au livreur (QR code)</p>
        )}
        {!order.payment_method && (
          <p className="text-sm text-mute">Paiement sur place (non précisé).</p>
        )}
      </div>

      {/* Actions */}
      {(nextAction || canCancel) && (
        <div className="space-y-2.5">
          {actionError && (
            <div className="rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm font-medium text-rialto">
              {actionError}
            </div>
          )}
          {nextAction && (
            <button
              type="button"
              disabled={acting}
              onClick={() => changeStatus(nextAction.status)}
              className="w-full rounded-full bg-rialto py-3.5 font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
            >
              {acting ? "…" : nextAction.label}
            </button>
          )}
          {canCancel && !refusing && (
            <button
              type="button"
              onClick={() => setRefusing(true)}
              className="w-full rounded-full border border-border bg-white py-3 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
            >
              Refuser la commande
            </button>
          )}
          {refusing && (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
              <label className="mb-1.5 block text-sm font-semibold text-ink">
                Motif du refus (interne, non envoyé au client)
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex : rupture d'ingrédient, hors zone…"
                className="w-full rounded-xl border-2 border-border px-3 py-2.5 text-sm focus:border-rialto focus:outline-none"
                autoFocus
              />
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRefusing(false);
                    setReason("");
                  }}
                  className="flex-1 rounded-full border border-border py-2.5 text-sm font-semibold text-ink/70"
                >
                  Retour
                </button>
                <button
                  type="button"
                  disabled={!reason.trim() || acting}
                  onClick={() => changeStatus("cancelled", reason.trim())}
                  className="flex-1 rounded-full bg-ink py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  Confirmer le refus
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Historique */}
      {order.history.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
            Historique
          </h2>
          <ul className="space-y-1 text-xs text-mute">
            {order.history.map((h, i) => (
              <li key={i}>
                {new Date(h.changed_at).toLocaleString("fr-CH", {
                  timeZone: "Europe/Zurich",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                — {STATUS_LABELS[h.new_status] ?? h.new_status}
                {h.changed_by ? ` (${h.changed_by})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
