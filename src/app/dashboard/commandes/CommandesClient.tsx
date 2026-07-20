"use client";

/**
 * Liste des commandes — dashboard patron.
 * Actives en haut (nouvelles surlignées), terminées 48 h dessous.
 * Polling 15 s. Tap → fiche détail.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCHF } from "@/lib/format";
import {
  STATUS_LABELS,
  statusChipClasses,
} from "@/components/dashboard/orderStatus";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  customer_name: string;
  total_amount: number;
  fulfillment_type: "pickup" | "delivery";
  requested_pickup_time: string | null;
  created_at: string;
  delivery_city: string | null;
  payment_method: string | null;
};

export default function CommandesClient() {
  const [active, setActive] = useState<OrderRow[]>([]);
  const [recent, setRecent] = useState<OrderRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/dashboard/orders", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const body = (await res.json()) as {
          ok: boolean;
          active: OrderRow[];
          recent: OrderRow[];
        };
        if (body.ok) {
          setActive(body.active);
          setRecent(body.recent);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    load();
    const t = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-ink">Commandes</h1>

      {error && (
        <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-4 text-sm font-medium text-rialto">
          Impossible de charger les commandes. Rechargez la page.
        </div>
      )}

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
          En cours ({active.length})
        </h2>
        {loaded && active.length === 0 && !error && (
          <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-mute">
            Aucune commande en cours.
          </div>
        )}
        <ul className="space-y-2.5">
          {active.map((o) => (
            <OrderCard key={o.id} order={o} highlight={o.status === "new"} />
          ))}
        </ul>
      </section>

      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
            Terminées récemment
          </h2>
          <ul className="space-y-2.5">
            {recent.map((o) => (
              <OrderCard key={o.id} order={o} highlight={false} muted />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function OrderCard({
  order,
  highlight,
  muted = false,
}: {
  order: OrderRow;
  highlight: boolean;
  muted?: boolean;
}) {
  const time = order.requested_pickup_time
    ? new Date(order.requested_pickup_time).toLocaleTimeString("fr-CH", {
        timeZone: "Europe/Zurich",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "dès que possible";

  return (
    <li>
      <Link
        href={`/dashboard/commandes/${order.id}`}
        className={`block rounded-2xl border p-4 shadow-card transition hover:shadow-pop ${
          highlight
            ? "border-rialto/50 bg-rialto/5"
            : muted
              ? "border-border bg-white opacity-70"
              : "border-border bg-white"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-display font-bold text-ink">
            {order.order_number}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statusChipClasses(order.status)}`}
          >
            {STATUS_LABELS[order.status] ?? order.status}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
          <span className="truncate text-ink/85">{order.customer_name}</span>
          <span className="tabular flex-shrink-0 font-display font-semibold text-ink">
            {formatCHF(Number(order.total_amount))}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-mute">
          {order.fulfillment_type === "delivery" ? "🚴 Livraison" : "🏪 Retrait"}
          {" · "}
          {time}
        </div>
      </Link>
    </li>
  );
}
