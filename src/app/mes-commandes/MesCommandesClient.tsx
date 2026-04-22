"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteFooter from "@/components/home/SiteFooter";
import { formatCHF } from "@/lib/format";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { readCustomerSession } from "@/lib/customerSession";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "En attente", color: "bg-gray-100 text-gray-700" },
  accepted: { label: "Acceptée", color: "bg-blue-50 text-blue-700" },
  preparing: { label: "En préparation", color: "bg-amber-50 text-amber-800" },
  ready: { label: "En livraison", color: "bg-orange-50 text-orange-800" },
  completed: { label: "Livrée", color: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Annulée", color: "bg-rialto/10 text-rialto" },
};

export default function MesCommandesClient() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [authState, setAuthState] = useState<"unknown" | "logged_in" | "guest">(
    "unknown",
  );

  useEffect(() => {
    const session = readCustomerSession();
    if (!session) {
      setAuthState("guest");
      setLoading(false);
      return;
    }
    setAuthState("logged_in");

    (async () => {
      try {
        const url = new URL(`${STAMPIFY_BASE}/api/rialto/loyalty/lookup`);
        url.searchParams.set("phone", session.phone);
        const res = await fetch(url.toString());
        if (!res.ok) {
          setOrders([]);
          return;
        }
        const body = (await res.json()) as { orders?: OrderRow[] };
        setOrders(body.orders ?? []);
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <main className="min-h-screen bg-cream pb-16 pt-20 md:pt-24">
        <div className="container-hero">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Retour
          </Link>

          <header className="mb-8 max-w-prose-wide">
            <span className="eyebrow">Rialto Club</span>
            <h1 className="mt-3 font-display text-h1 font-bold">
              Mes commandes
            </h1>
            <p className="mt-2 text-base text-mute">
              Historique de tes commandes Rialto.
            </p>
          </header>

          {authState === "guest" && (
            <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-8 text-center shadow-card">
              <div className="mx-auto mb-4 text-4xl">🔑</div>
              <h2 className="font-display text-xl font-bold">
                Pas de compte Rialto Club
              </h2>
              <p className="mt-2 text-sm text-mute">
                Pour voir ton historique, crée ta carte fidélité (gratuite,
                30 sec).
              </p>
              <Link
                href="/rialto-club/join"
                className="btn-primary mt-5"
              >
                Rejoindre Rialto Club
              </Link>
            </div>
          )}

          {authState === "logged_in" && loading && (
            <div className="mx-auto max-w-2xl space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl border border-border bg-white"
                />
              ))}
            </div>
          )}

          {authState === "logged_in" && !loading && orders.length === 0 && (
            <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-8 text-center">
              <div className="mx-auto mb-4 text-4xl">🍕</div>
              <h2 className="font-display text-xl font-bold">
                Pas encore de commande
              </h2>
              <p className="mt-2 text-sm text-mute">
                C&apos;est le moment de tester la pizza Bethusy.
              </p>
              <Link href="/menu" className="btn-primary mt-5">
                Voir le menu
              </Link>
            </div>
          )}

          {authState === "logged_in" && !loading && orders.length > 0 && (
            <ul className="mx-auto max-w-2xl space-y-3">
              {orders.map((order) => {
                const status =
                  STATUS_LABELS[order.status] ?? STATUS_LABELS.new;
                const date = new Date(order.created_at).toLocaleDateString(
                  "fr-CH",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  },
                );
                return (
                  <li key={order.id}>
                    <Link
                      href={`/confirmation/${order.order_number}`}
                      className="group flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold">
                            {order.order_number}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}
                          >
                            {status.label}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-mute">{date}</div>
                      </div>
                      <div className="text-right">
                        <div className="tabular font-display text-base font-bold">
                          {formatCHF(Number(order.total_amount))}
                        </div>
                        <div className="text-[10px] text-mute">
                          Voir le détail →
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
