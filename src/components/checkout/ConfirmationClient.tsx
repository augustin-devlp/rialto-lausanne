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
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCHF } from "@/lib/format";
import { RIALTO_INFO } from "@/lib/rialto-data";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

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

type LoyaltyCardState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "has_card";
      short_code: string;
      current_stamps: number;
      stamps_required: number;
      reward_description: string;
    }
  | { status: "needs_signup" }
  | { status: "signing_up" }
  | { status: "error"; message: string };

export default function ConfirmationClient({ order: initialOrder }: Props) {
  const [order, setOrder] = useState<OrderData>(initialOrder);
  const statusRef = useRef<OrderStatus>(initialOrder.status);
  const tickCountRef = useRef(0);
  const [loyalty, setLoyalty] = useState<LoyaltyCardState>({ status: "idle" });

  // Polling 15s sur le statut.
  //
  // Particularités :
  // 1. Fetch immédiat à t=0 (pas d'attente 15s au premier tick) pour
  //    refléter tout de suite un changement de statut qui aurait eu lieu
  //    entre la création de l'order et l'arrivée sur la page.
  // 2. Dépendances du useEffect : uniquement order.id. On utilise des refs
  //    pour le status courant afin d'éviter de relancer le timer à chaque
  //    update (ce qui resetterait le MAX_MS à chaque tick).
  // 3. Stop auto sur terminal status (completed/cancelled) ou après 2h.
  // 4. Logs détaillés pour diagnostiquer en prod si le polling ne reflète
  //    pas un status réel (format préfixé [timeline-poll] pour grep).
  useEffect(() => {
    const orderId = order.id;
    const orderNumber = order.order_number;
    const startedAt = Date.now();
    const MAX_MS = 2 * 60 * 60 * 1000; // 2h

    let stopped = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stop = (reason: string) => {
      if (stopped) return;
      stopped = true;
      if (intervalId) clearInterval(intervalId);
      console.log(
        `[timeline-poll] polling stopped orderNumber=${orderNumber} reason=${reason} ticks=${tickCountRef.current}`,
      );
    };

    const tick = async () => {
      if (stopped) return;
      tickCountRef.current += 1;
      const tickId = tickCountRef.current;

      if (Date.now() - startedAt > MAX_MS) {
        stop("max_duration_2h");
        return;
      }

      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          cache: "no-store",
          headers: { "x-poll-tick": String(tickId) },
        });
        if (!res.ok) {
          console.warn(
            `[timeline-poll] tick #${tickId} orderNumber=${orderNumber} http_error=${res.status}`,
          );
          return;
        }
        const body = (await res.json()) as { order?: OrderData };
        if (!body.order) {
          console.warn(
            `[timeline-poll] tick #${tickId} orderNumber=${orderNumber} no_order_in_response`,
          );
          return;
        }
        const newStatus = body.order.status;
        const oldStatus = statusRef.current;
        console.log(
          `[timeline-poll] tick #${tickId} orderNumber=${orderNumber} current_status=${newStatus}`,
        );
        if (newStatus !== oldStatus) {
          console.log(
            `[timeline-poll] status CHANGED from ${oldStatus} to ${newStatus} orderNumber=${orderNumber}`,
          );
          statusRef.current = newStatus;
          setOrder(body.order);
        }
        if (newStatus === "completed" || newStatus === "cancelled") {
          stop(`terminal_status_${newStatus}`);
        }
      } catch (err) {
        console.warn(
          `[timeline-poll] tick #${tickId} orderNumber=${orderNumber} network_error`,
          err,
        );
      }
    };

    // Fetch immédiat à t=0 (pas d'attente 15s)
    console.log(
      `[timeline-poll] START orderNumber=${orderNumber} order_id=${orderId} initial_status=${statusRef.current}`,
    );
    void tick();

    // Si déjà en statut terminal à l'arrivée, on ne démarre pas d'intervalle
    if (
      statusRef.current === "completed" ||
      statusRef.current === "cancelled"
    ) {
      stop(`already_terminal_${statusRef.current}`);
    } else {
      intervalId = setInterval(tick, 15_000);
    }

    return () => stop("unmount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const currentStep = stepIndex(order.status);
  const firstName = order.customer_name.split(" ")[0] ?? "";
  const isCancelled = order.status === "cancelled";

  /* ─── Carte fidélité : détection automatique au mount ──────────────── */
  const lookupCard = useCallback(async () => {
    if (!order.customer_phone) return;
    setLoyalty({ status: "checking" });
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/loyalty/lookup?phone=${encodeURIComponent(order.customer_phone)}`,
      );
      if (res.ok) {
        const body = (await res.json()) as {
          card?: {
            short_code: string | null;
            current_stamps: number;
            stamps_required: number;
            reward_description: string;
          } | null;
        };
        if (body.card && body.card.short_code) {
          setLoyalty({
            status: "has_card",
            short_code: body.card.short_code,
            current_stamps: body.card.current_stamps,
            stamps_required: body.card.stamps_required,
            reward_description: body.card.reward_description,
          });
          return;
        }
      }
      setLoyalty({ status: "needs_signup" });
    } catch {
      setLoyalty({ status: "needs_signup" });
    }
  }, [order.customer_phone]);

  useEffect(() => {
    void lookupCard();
  }, [lookupCard]);

  async function createCard() {
    setLoyalty({ status: "signing_up" });
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/loyalty/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: order.customer_name.split(" ").slice(1).join(" ") || "",
          phone: order.customer_phone,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoyalty({
          status: "error",
          message: (body as { error?: string }).error ?? "Erreur serveur",
        });
        return;
      }
      const body = (await res.json()) as {
        card: {
          short_code: string | null;
          current_stamps: number;
          stamps_required: number;
          reward_description: string;
        };
      };
      if (!body.card.short_code) {
        // Re-lookup pour récupérer le short_code (cas où le backfill vient
        // juste de se faire)
        await lookupCard();
        return;
      }
      setLoyalty({
        status: "has_card",
        short_code: body.card.short_code,
        current_stamps: body.card.current_stamps,
        stamps_required: body.card.stamps_required,
        reward_description: body.card.reward_description,
      });
    } catch (err) {
      setLoyalty({
        status: "error",
        message: err instanceof Error ? err.message : "Erreur réseau",
      });
    }
  }

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

      {/* ─── Carte fidélité — SECTION PROMINENTE (placée avant le récap) ── */}
      {!isCancelled && (
        <section className="container-hero mt-10">
          <div className="mx-auto max-w-xl">
            <LoyaltyCardSection
              loyalty={loyalty}
              firstName={firstName}
              phone={order.customer_phone}
              onCreate={createCard}
            />
          </div>
        </section>
      )}

      {/* Actions retour */}
      <section className="container-hero mt-8">
        <div className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row">
          <Link href="/" className="btn-ghost flex-1">
            Retour à l&apos;accueil
          </Link>
          <Link href="/menu" className="btn-ghost flex-1">
            Voir le menu
          </Link>
        </div>
      </section>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Section carte fidélité — UI proéminente one-click
   ═══════════════════════════════════════════════════════════════════════ */
function LoyaltyCardSection({
  loyalty,
  firstName,
  phone,
  onCreate,
}: {
  loyalty: LoyaltyCardState;
  firstName: string;
  phone: string;
  onCreate: () => void;
}) {
  // Masque le numéro pour l'affichage (+41 79 *** 45 67 → +41 79 XX XX 67)
  const phoneMasked = phone
    ? phone.replace(/(\+?\d{2,3})(\d+)(\d{2})$/, "$1 ... $3")
    : "";

  if (loyalty.status === "idle" || loyalty.status === "checking") {
    return (
      <div className="rounded-3xl border border-border bg-white p-6 shadow-card md:p-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-cream-dark" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-cream-dark" />
            <div className="h-3 w-48 animate-pulse rounded bg-cream-dark" />
          </div>
        </div>
      </div>
    );
  }

  if (loyalty.status === "has_card") {
    const pct = Math.min(
      100,
      Math.round(
        (loyalty.current_stamps / Math.max(1, loyalty.stamps_required)) * 100,
      ),
    );
    const cardUrl = `${STAMPIFY_BASE}/c/${loyalty.short_code}`;
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rialto to-rialto-dark p-6 text-white shadow-pop md:p-8">
        <span className="eyebrow !text-saffron">Ta carte fidélité</span>
        <h3 className="mt-3 font-display text-2xl font-bold leading-tight md:text-3xl">
          {loyalty.current_stamps} tampon
          {loyalty.current_stamps > 1 ? "s" : ""} sur{" "}
          {loyalty.stamps_required}
        </h3>
        <p className="mt-1 text-sm text-white/85">
          {loyalty.stamps_required - loyalty.current_stamps > 0
            ? `Encore ${loyalty.stamps_required - loyalty.current_stamps} pour ${loyalty.reward_description.toLowerCase()}.`
            : `🎉 Carte complète ! ${loyalty.reward_description} à récupérer.`}
        </p>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-saffron transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-sm font-semibold text-rialto transition hover:bg-cream"
          >
            Afficher mon QR code
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>
        <p className="mt-3 text-center text-[11px] text-white/60">
          Code : <span className="font-mono font-semibold text-white/90">{loyalty.short_code}</span>
        </p>
      </div>
    );
  }

  if (loyalty.status === "signing_up") {
    return (
      <div className="rounded-3xl border-2 border-rialto bg-rialto/5 p-6 text-center md:p-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rialto text-white">
          <svg
            className="animate-spin"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <h3 className="font-display text-xl font-bold">
          Création de ta carte…
        </h3>
        <p className="mt-1 text-sm text-mute">
          On t&apos;envoie ton QR par SMS dans quelques secondes.
        </p>
      </div>
    );
  }

  if (loyalty.status === "error") {
    return (
      <div className="rounded-3xl border border-rialto/30 bg-rialto/10 p-6">
        <h3 className="font-display text-lg font-semibold text-rialto">
          Erreur
        </h3>
        <p className="mt-1 text-sm text-ink/80">{loyalty.message}</p>
        <button
          type="button"
          onClick={onCreate}
          className="btn-primary mt-3"
        >
          Réessayer
        </button>
      </div>
    );
  }

  // needs_signup
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-rialto bg-cream p-6 text-ink shadow-pop md:p-8">
      {/* Badge d'intro */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-3xl">🎴</div>
        <div>
          <span className="eyebrow">Profite de tes avantages Rialto</span>
          <h3 className="mt-2 font-display text-xl font-bold leading-tight md:text-2xl">
            Crée ta carte fidélité{" "}
            <em className="italic text-rialto">en 1 clic</em>
          </h3>
          <p className="mt-1.5 text-sm text-mute">
            1 tampon offert tout de suite + 1 tampon à chaque commande.
            À 10 tampons, une pizza Ø33 cm offerte.
          </p>
        </div>
      </div>

      {/* Bénéfices */}
      <ul className="mt-5 space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
            ✓
          </span>
          <span className="text-ink">1 pizza Ø33 cm offerte tous les 10 tampons</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
            ✓
          </span>
          <span className="text-ink">Tour de roue chaque mois</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
            ✓
          </span>
          <span className="text-ink">Offres spéciales anniversaire</span>
        </li>
      </ul>

      {/* CTA one-click : réutilise le téléphone de la commande */}
      <button
        type="button"
        onClick={onCreate}
        className="btn-primary-lg mt-6 w-full"
      >
        🎴 Créer ma carte avec {phoneMasked || "ce numéro"}
      </button>

      <p className="mt-2 text-center text-[11px] text-mute">
        Gratuit · aucune carte plastique · juste un QR code à montrer
      </p>
    </div>
  );
}
