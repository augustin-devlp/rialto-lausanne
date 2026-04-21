"use client";

/**
 * Page /confirmation/[orderNumber] — célébration post-commande.
 * - Checkmark animé + message merci
 * - Récap items
 * - Timeline état commande avec polling 15s
 * - Bouton "Créer carte fidélité" → ouvre modal/signup
 * - Bouton "Télécharger ticket PDF" (optionnel, via endpoint existant)
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCHF } from "@/lib/format";
import { RIALTO_INFO } from "@/lib/rialto-data";

type OrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

type OrderData = {
  id: string;
  order_number: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  fulfillment_type: "pickup" | "delivery";
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  created_at: string;
  requested_pickup_time: string | null;
  items: Array<{
    item_name_snapshot: string;
    item_price_snapshot: number;
    quantity: number;
    selected_options: Array<{ group?: string; name: string }>;
    subtotal: number;
  }>;
};

type Props = {
  order: OrderData;
};

const STEPS: { key: OrderStatus; label: string; description: string }[] = [
  {
    key: "new",
    label: "Commande reçue",
    description: "Rialto a bien reçu votre commande.",
  },
  {
    key: "accepted",
    label: "Acceptée",
    description: "Le restaurant confirme la commande.",
  },
  {
    key: "preparing",
    label: "En préparation",
    description: "Les pâtes sont au four.",
  },
  {
    key: "ready",
    label: "En livraison",
    description: "Le livreur est en route.",
  },
  {
    key: "completed",
    label: "Livrée",
    description: "Bon appétit !",
  },
];

function stepIndex(status: OrderStatus): number {
  if (status === "cancelled") return -1;
  const idx = STEPS.findIndex((s) => s.key === status);
  return idx === -1 ? 0 : idx;
}

export default function ConfirmationClient({ order: initialOrder }: Props) {
  const [order, setOrder] = useState<OrderData>(initialOrder);

  // Polling 15s sur le statut (uniquement tant que la commande n'est pas
  // terminée ou annulée — après 2h on stoppe pour éviter un polling infini).
  useEffect(() => {
    if (order.status === "completed" || order.status === "cancelled") return;

    const startedAt = Date.now();
    const MAX_MS = 2 * 60 * 60 * 1000; // 2h

    const tick = async () => {
      if (Date.now() - startedAt > MAX_MS) return;
      try {
        const res = await fetch(`/api/orders/${order.id}`, { cache: "no-store" });
        if (res.ok) {
          const body = (await res.json()) as { order?: OrderData };
          if (body.order) setOrder(body.order);
        }
      } catch {
        /* ignore transient errors */
      }
    };

    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [order.id, order.status]);

  const currentStep = stepIndex(order.status);
  const firstName = order.customer_name.split(" ")[0] ?? "";
  const isCancelled = order.status === "cancelled";

  return (
    <main className="min-h-screen bg-cream pb-20">
      {/* Bandeau célébration */}
      <section className="relative overflow-hidden bg-white py-14 md:py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #C73E1D 1.5px, transparent 1.5px), radial-gradient(circle at 70% 80%, #E6A12C 1.5px, transparent 1.5px)",
            backgroundSize: "40px 40px, 60px 60px",
          }}
          aria-hidden
        />
        <div className="container-hero relative text-center">
          {isCancelled ? (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rialto/10">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C73E1D"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          ) : (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rialto text-white shadow-pop animate-fade-up">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
          <h1 className="mt-6 font-display text-h1 font-bold">
            {isCancelled
              ? "Commande annulée"
              : `Merci ${firstName} !`}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-mute">
            {isCancelled ? (
              <>
                Votre commande {order.order_number} a été annulée. Pour toute
                question : {RIALTO_INFO.phoneDisplay}
              </>
            ) : (
              <>
                Votre commande{" "}
                <span className="font-semibold text-ink">
                  {order.order_number}
                </span>{" "}
                est enregistrée. Vous recevrez un SMS à chaque étape.
              </>
            )}
          </p>
        </div>
      </section>

      {/* Timeline */}
      {!isCancelled && (
        <section className="container-hero mt-10">
          <div className="mx-auto max-w-xl rounded-3xl border border-border bg-white p-6 shadow-card md:p-8">
            <h2 className="mb-6 font-display text-xl font-bold">
              Suivi de la commande
            </h2>
            <ol className="space-y-4">
              {STEPS.map((step, idx) => {
                const done = idx <= currentStep;
                const current = idx === currentStep;
                return (
                  <li key={step.key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${
                          done
                            ? "border-rialto bg-rialto text-white"
                            : "border-border bg-white text-mute"
                        } ${current ? "animate-pulse-ring" : ""}`}
                      >
                        {done ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <span className="tabular text-xs font-semibold">
                            {idx + 1}
                          </span>
                        )}
                      </div>
                      {idx < STEPS.length - 1 && (
                        <div
                          className={`mt-1 h-full w-0.5 ${
                            done ? "bg-rialto" : "bg-border"
                          }`}
                        />
                      )}
                    </div>
                    <div className="pb-4">
                      <div
                        className={`font-display font-semibold ${
                          done ? "text-ink" : "text-mute"
                        }`}
                      >
                        {step.label}
                      </div>
                      <div className="text-sm text-mute">
                        {step.description}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      {/* Récap */}
      <section className="container-hero mt-10">
        <div className="mx-auto max-w-xl rounded-3xl border border-border bg-white p-6 shadow-card md:p-8">
          <h2 className="font-display text-xl font-bold">Votre commande</h2>
          <ul className="mt-4 divide-y divide-border">
            {order.items.map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold text-ink">
                    {it.quantity}&nbsp;×&nbsp;{it.item_name_snapshot}
                  </div>
                  {it.selected_options.length > 0 && (
                    <div className="mt-0.5 text-xs text-mute">
                      {it.selected_options.map((o) => o.name).join(", ")}
                    </div>
                  )}
                </div>
                <span className="tabular shrink-0 font-display text-sm font-semibold">
                  {formatCHF(Number(it.subtotal))}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-mute">Livraison</dt>
              <dd className="font-medium">
                {order.delivery_address}, {order.delivery_postal_code}{" "}
                {order.delivery_city}
              </dd>
            </div>
            <div className="flex justify-between font-display text-base font-bold">
              <dt>Total à régler au livreur</dt>
              <dd className="tabular">{formatCHF(Number(order.total_amount))}</dd>
            </div>
          </dl>

          <div className="mt-6 rounded-xl bg-saffron/15 p-4 text-sm text-ink">
            <span className="font-semibold">💶 Paiement au livreur.</span>{" "}
            Cash, TWINT ou carte bancaire acceptés.
          </div>
        </div>
      </section>

      {/* Actions */}
      <section className="container-hero mt-10">
        <div className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row">
          <Link href="/" className="btn-ghost flex-1">
            Retour à l'accueil
          </Link>
          <Link href={`/order/${order.id}`} className="btn-primary flex-1">
            Créer ma carte fidélité
          </Link>
        </div>
      </section>
    </main>
  );
}
