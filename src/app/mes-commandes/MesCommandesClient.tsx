"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SiteFooter from "@/components/home/SiteFooter";
import { formatCHF } from "@/lib/format";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { readCustomerSession } from "@/lib/customerSession";
import { readCart, writeCart } from "@/lib/clientStore";
import type { CartItem } from "@/lib/types";

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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [authState, setAuthState] = useState<"unknown" | "logged_in" | "guest">(
    "unknown",
  );
  const [reorderingId, setReorderingId] = useState<string | null>(null);

  async function handleReorder(orderNumber: string) {
    setReorderingId(orderNumber);
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/orders/${encodeURIComponent(orderNumber)}/reorder`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        cart_items: CartItem[];
        unavailable_count: number;
      };
      if (!body.cart_items || body.cart_items.length === 0) {
        alert(
          body.unavailable_count > 0
            ? `Désolé, aucun des plats de cette commande n'est plus disponible aujourd'hui.`
            : "Impossible de recharger cette commande.",
        );
        return;
      }
      // Merge avec cart actuel : si même key, incrément quantité
      const currentCart = readCart();
      const merged: CartItem[] = [...currentCart];
      for (const newItem of body.cart_items) {
        const existing = merged.find((c) => c.key === newItem.key);
        if (existing) {
          existing.quantity += newItem.quantity;
          existing.subtotal = existing.unit_price * existing.quantity;
        } else {
          merged.push(newItem);
        }
      }
      writeCart(merged);
      const note =
        body.unavailable_count > 0
          ? ` (${body.unavailable_count} plat${body.unavailable_count > 1 ? "s" : ""} indisponible${body.unavailable_count > 1 ? "s" : ""} ignoré${body.unavailable_count > 1 ? "s" : ""})`
          : "";
      // Petite notification native avant redirect
      console.log(`[reorder] ${body.cart_items.length} items ajoutés${note}`);
      router.push("/checkout");
    } catch (err) {
      console.error("[reorder] failed", err);
      alert("Erreur lors de la re-commande. Réessaie dans un instant.");
    } finally {
      setReorderingId(null);
    }
  }

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
      <main className="min-h-screen bg-cream pb-12 pt-16 md:pt-20">
        <div className="container-hero">
          <Link
            href="/"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"
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

          <header className="mb-5 max-w-prose-wide">
            <span className="eyebrow">Rialto Club</span>
            <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold">
              Mes commandes
            </h1>
            <p className="mt-1 text-sm text-mute">
              Historique de tes commandes Rialto.
            </p>
          </header>

          {authState === "guest" && (
            <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-5 text-center shadow-card">
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
            <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-5 text-center">
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
                const isReordering = reorderingId === order.order_number;
                return (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-border bg-white shadow-card transition hover:shadow-pop"
                  >
                    <div className="flex items-center gap-4 p-4">
                      <Link
                        href={`/confirmation/${order.order_number}`}
                        className="flex flex-1 items-center gap-3 hover:opacity-90"
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
                          <div className="mt-0.5 text-xs text-mute">
                            {date}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="tabular font-display text-base font-bold">
                            {formatCHF(Number(order.total_amount))}
                          </div>
                        </div>
                      </Link>
                    </div>
                    {/* Phase 11 C7 : bouton recommander */}
                    <div className="border-t border-border px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleReorder(order.order_number)}
                        disabled={isReordering}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-rialto/10 px-3 py-2 text-sm font-semibold text-rialto transition hover:bg-rialto hover:text-white disabled:opacity-60"
                      >
                        {isReordering ? (
                          <>
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Ajout au panier…
                          </>
                        ) : (
                          <>
                            🔁 Recommander en 1 clic
                          </>
                        )}
                      </button>
                    </div>
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
