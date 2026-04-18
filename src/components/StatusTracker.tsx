"use client";

import { useEffect, useState } from "react";
import type { Order, OrderItemRow, OrderStatus, Restaurant } from "@/lib/types";
import { supabaseBrowser } from "@/lib/supabase";
import { formatCHF } from "@/lib/format";

type Props = {
  order: Order;
  items: OrderItemRow[];
  restaurant: Pick<Restaurant, "name" | "address" | "phone">;
};

const STAGES: { key: OrderStatus; label: string; icon: string }[] = [
  { key: "new", label: "Commande reçue", icon: "📥" },
  { key: "accepted", label: "Acceptée", icon: "✅" },
  { key: "preparing", label: "En préparation", icon: "👨‍🍳" },
  { key: "ready", label: "Prête à récupérer", icon: "🎉" },
];

function stageIndex(status: OrderStatus): number {
  const i = STAGES.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}

export default function StatusTracker({ order, items, restaurant }: Props) {
  const [status, setStatus] = useState<OrderStatus>(order.status);

  useEffect(() => {
    const sb = supabaseBrowser();
    const channel = sb
      .channel(`order:${order.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${order.id}`,
        },
        (payload) => {
          const next = (payload.new as { status: OrderStatus }).status;
          setStatus(next);
        },
      )
      .subscribe();
    return () => {
      sb.removeChannel(channel);
    };
  }, [order.id]);

  const activeIdx = stageIndex(status);
  const cancelled = status === "cancelled";
  const completed = status === "completed";

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 text-center">
        <div className="text-sm font-medium text-mute">Votre commande</div>
        <div className="mt-1 text-4xl font-black tracking-tight">
          {order.order_number}
        </div>
        <div className="mt-3 text-sm text-mute">
          {cancelled
            ? "Commande annulée"
            : completed
              ? "Commande terminée"
              : status === "ready"
                ? "🎉 Votre commande est prête !"
                : "Suivi en direct"}
        </div>
      </div>

      {cancelled ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-900">
          Cette commande a été annulée. Merci de nous contacter au{" "}
          <a href={`tel:${restaurant.phone}`} className="underline">
            {restaurant.phone}
          </a>
          .
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
          <div className="space-y-4">
            {STAGES.map((stage, i) => {
              const done = i <= activeIdx;
              const current = i === activeIdx && !completed;
              return (
                <div key={stage.key} className="flex items-center gap-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm ${
                      done
                        ? "bg-rialto text-white"
                        : "border-2 border-gray-200 bg-white text-gray-300"
                    } ${current ? "animate-pulseRing" : ""}`}
                  >
                    {done ? "✓" : stage.icon}
                  </div>
                  <div className="flex-1">
                    <div
                      className={`font-semibold ${
                        done ? "text-ink" : "text-gray-400"
                      }`}
                    >
                      {stage.label}
                    </div>
                    {current && (
                      <div className="text-xs text-mute">En cours…</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Récap */}
      <div className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-card">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-mute">
          Récapitulatif
        </h3>
        <ul className="mb-3 space-y-2 text-sm">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3">
              <span className="flex-1">
                <span className="font-medium">
                  {it.quantity}× {it.item_name_snapshot}
                </span>
                {Array.isArray(it.selected_options) &&
                  it.selected_options.length > 0 && (
                    <span className="block text-xs text-mute">
                      {it.selected_options
                        .map((o) => (typeof o === "object" ? o.name : String(o)))
                        .join(", ")}
                    </span>
                  )}
                {it.notes && (
                  <span className="block text-xs italic text-mute">
                    « {it.notes} »
                  </span>
                )}
              </span>
              <span className="font-semibold">
                {formatCHF(Number(it.subtotal))}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-gray-100 pt-3 text-base font-bold">
          <span>Total à payer en magasin</span>
          <span>{formatCHF(Number(order.total_amount))}</span>
        </div>
      </div>

      {/* Pickup info */}
      <div className="mt-6 rounded-2xl border border-gray-100 bg-surface p-6">
        <h3 className="mb-2 text-sm font-semibold">📍 Retrait en magasin</h3>
        <p className="text-sm text-ink">
          <strong>{restaurant.name}</strong>
        </p>
        <p className="text-sm text-mute">{restaurant.address}</p>
        <a
          href={`tel:${restaurant.phone}`}
          className="mt-2 inline-block text-sm font-semibold text-rialto"
        >
          📞 {restaurant.phone}
        </a>
        {order.requested_pickup_time && (
          <p className="mt-3 text-sm">
            Heure de retrait demandée :{" "}
            <strong>
              {new Date(order.requested_pickup_time).toLocaleTimeString(
                "fr-CH",
                {
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Europe/Zurich",
                },
              )}
            </strong>
          </p>
        )}
        <p className="mt-4 rounded-lg bg-white p-3 text-xs text-mute">
          💬 Vous recevrez un SMS dès que votre commande sera prête.
        </p>
      </div>
    </div>
  );
}
