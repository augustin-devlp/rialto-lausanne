"use client";

/**
 * Page /rialto-club/roue — 4 états contextuels.
 * Voir brief Phase 6 FIX 3 : A/B/C/D.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteFooter from "@/components/home/SiteFooter";
import ReviewGateModal from "@/components/ReviewGateModal";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { readCustomerSession } from "@/lib/customerSession";

type State = "A" | "B" | "C" | "D" | "INACTIVE";

type AvailabilityResponse = {
  state: State;
  can_spin: boolean;
  reason: string;
  frequency_days: number;
  wait_days_remaining?: number | null;
  next_spin_at?: string | null;
  min_orders?: number;
  orders_since_last_spin?: number;
  requires_review?: boolean;
  last_prize?: {
    code: string;
    description: string;
    used: boolean;
  } | null;
  segments?: Array<{ label?: string; color?: string }>;
};

const RIALTO_PLACE_ID = "ChIJrbzJL6cvjEcRHK7RrA9M3ic";

export default function RoueClient() {
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<{
    reward: string;
    code: string | null;
  } | null>(null);
  const [spinError, setSpinError] = useState<string | null>(null);

  const fetchAvailability = async (custId: string) => {
    setLoading(true);
    try {
      const url = new URL(`${STAMPIFY_BASE}/api/spin/availability`);
      url.searchParams.set("customer_id", custId);
      const res = await fetch(url.toString(), { cache: "no-store" });
      if (!res.ok) {
        setData({
          state: "INACTIVE",
          can_spin: false,
          reason: "fetch_failed",
          frequency_days: 30,
        });
        return;
      }
      setData((await res.json()) as AvailabilityResponse);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const session = readCustomerSession();
    if (!session) {
      setAuthed(false);
      setLoading(false);
      return;
    }
    setCustomerId(session.customer_id);
    void fetchAvailability(session.customer_id);
  }, []);

  async function handleSpin() {
    if (!customerId || spinning) return;
    const session = readCustomerSession();
    if (!session) return;
    setSpinning(true);
    setSpinError(null);
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/loyalty/spin`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            phone: session.phone,
            first_name: session.first_name,
          }),
        },
      );
      const body = (await res.json()) as {
        ok?: boolean;
        reward?: string;
        code?: string | null;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setSpinError(body.error ?? "Erreur lors du spin");
        return;
      }
      setSpinResult({
        reward: body.reward ?? "Récompense",
        code: body.code ?? null,
      });
      // Re-fetch availability pour basculer en état C
      await fetchAvailability(customerId);
    } catch (err) {
      setSpinError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setSpinning(false);
    }
  }

  if (!authed) {
    return (
      <>
        <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 pt-20 md:pt-24">
          <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rialto/10 text-4xl">
              🎰
            </div>
            <h1 className="font-display text-h2 font-bold">La roue Rialto</h1>
            <p className="mt-3 text-base text-mute">
              Tente ta chance pour gagner des réductions et des plats offerts.
              Rejoins le Rialto Club pour y accéder.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href="/rialto-club/join" className="btn-primary">
                Rejoindre Rialto Club
              </Link>
              <Link href="/" className="btn-ghost">
                Retour accueil
              </Link>
            </div>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  if (loading || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-cream pt-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-rialto border-t-transparent" />
      </main>
    );
  }

  /* ─── ÉTAT roue inactive ─── */
  if (data.state === "INACTIVE") {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">🎰</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            La roue n&apos;est pas active
          </h1>
          <p className="mt-3 text-base text-mute">
            Rialto a désactivé la roue temporairement. Tu peux tenter ta chance
            avec la loterie en attendant.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Link href="/rialto-club/loterie" className="btn-primary">
              🎟️ Voir la loterie
            </Link>
            <Link href="/menu" className="btn-ghost">
              Commander
            </Link>
          </div>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ─── ÉTAT A : peut spinner (post-spin ou avant) ─── */
  if (data.state === "A") {
    if (spinResult) {
      return (
        <StateWrapper>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rialto to-rialto-dark p-8 text-center text-white shadow-pop md:p-10">
            <div
              className="pointer-events-none absolute inset-0 opacity-25"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 10% 20%, #E6A12C 2px, transparent 3px), radial-gradient(circle at 85% 60%, #F9F1E4 2px, transparent 3px)",
                backgroundSize: "60px 60px, 80px 80px",
              }}
            />
            <div className="relative">
              <div className="text-6xl">🎉</div>
              <h1 className="mt-4 font-display text-h1 font-bold">
                Tu as gagné !
              </h1>
              <p className="mt-3 font-display text-xl font-semibold">
                {spinResult.reward}
              </p>
              {spinResult.code && (
                <div className="mt-6 rounded-2xl bg-white p-5 text-ink">
                  <div className="text-xs font-semibold uppercase tracking-wider text-mute">
                    Ton code promo
                  </div>
                  <div className="tabular mt-1 font-mono text-2xl font-bold text-rialto">
                    {spinResult.code}
                  </div>
                  <div className="mt-2 text-xs text-mute">
                    Valable 30 jours · applicable au checkout
                  </div>
                </div>
              )}
              <p className="mt-4 text-sm text-white/90">
                On t&apos;a aussi envoyé le code par SMS.
              </p>
              <Link href="/menu" className="mt-6 inline-block">
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-rialto hover:bg-cream">
                  Utiliser mon code →
                </span>
              </Link>
            </div>
          </div>
          <BackHome />
        </StateWrapper>
      );
    }

    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">🎰</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Prêt à tenter ta chance ?
          </h1>
          <p className="mt-3 text-base text-mute">
            Tourne la roue pour découvrir ton cadeau. Le code promo te sera
            envoyé par SMS.
          </p>
          <WheelPreview segments={data.segments} />
          {spinError && (
            <div className="mt-4 rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto">
              {spinError}
            </div>
          )}
          <button
            type="button"
            onClick={handleSpin}
            disabled={spinning}
            className="btn-primary-lg mt-6 w-full"
          >
            {spinning ? "🎯 On tourne…" : "🎰 Tourner la roue"}
          </button>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ─── ÉTAT B : doit laisser un avis Google ─── */
  if (data.state === "B" && customerId) {
    return (
      <StateWrapper>
        <div className="rounded-3xl border-2 border-saffron bg-saffron/10 p-8 text-center md:p-10">
          <div className="text-5xl">⭐</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Un avis pour débloquer la roue
          </h1>
          <p className="mt-3 text-base text-ink/80">
            Laisse un avis 5 étoiles sur Google pour débloquer la roue pendant{" "}
            {data.frequency_days} jours. Un geste qui nous aide beaucoup.
          </p>
          <button
            type="button"
            onClick={() => setReviewOpen(true)}
            className="btn-primary-lg mt-6"
          >
            ⭐ Laisser un avis Google
          </button>
        </div>
        <BackHome />

        {reviewOpen && (
          <ReviewGateModal
            customerId={customerId}
            placeId={RIALTO_PLACE_ID}
            purpose="spin"
            onClose={() => setReviewOpen(false)}
            onVerified={() => {
              setReviewOpen(false);
              void fetchAvailability(customerId);
            }}
          />
        )}
      </StateWrapper>
    );
  }

  /* ─── ÉTAT C : a déjà spinné, doit attendre ─── */
  if (data.state === "C") {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">🎯</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Tu as déjà tourné la roue
          </h1>
          <p className="mt-3 text-base text-mute">
            Prochaine chance dans{" "}
            <strong className="text-ink">
              {data.wait_days_remaining} jour
              {(data.wait_days_remaining ?? 0) > 1 ? "s" : ""}
            </strong>
            . Tu seras prévenu par SMS.
          </p>
          {data.last_prize && !data.last_prize.used && data.last_prize.code && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                💡 Ton code actuel est toujours valable
              </div>
              <div className="tabular mt-2 font-mono text-xl font-bold text-emerald-800">
                {data.last_prize.code}
              </div>
              <div className="mt-1 text-sm text-emerald-800">
                {data.last_prize.description}
              </div>
            </div>
          )}
          {data.last_prize?.used && (
            <div className="mt-6 rounded-xl bg-cream p-3 text-xs text-mute">
              Ton dernier code (<strong>{data.last_prize.code}</strong>) a déjà
              été utilisé.
            </div>
          )}
          <Link href="/menu" className="btn-ghost mt-6">
            Voir le menu
          </Link>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ─── ÉTAT D : doit passer une commande pour respin ─── */
  if (data.state === "D") {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">🍕</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Une commande pour retenter ta chance
          </h1>
          <p className="mt-3 text-base text-mute">
            Pour respinner, il faut{" "}
            <strong className="text-ink">
              {data.min_orders ?? 1} commande
              {(data.min_orders ?? 1) > 1 ? "s" : ""}
            </strong>{" "}
            depuis ton dernier spin. Tu en as{" "}
            <strong className="text-ink">
              {data.orders_since_last_spin ?? 0}
            </strong>{" "}
            pour l&apos;instant.
          </p>
          {data.last_prize && !data.last_prize.used && data.last_prize.code && (
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="text-xs text-emerald-700">
                Rappel : ton code{" "}
                <strong className="font-mono">{data.last_prize.code}</strong> (
                {data.last_prize.description}) est encore valable.
              </div>
            </div>
          )}
          <Link href="/menu" className="btn-primary-lg mt-6 w-full">
            Commander maintenant →
          </Link>
          <p className="mt-3 text-xs text-mute">
            On te préviendra par SMS dès que tu peux respinner.
          </p>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  return null;
}

/* ─── Preview visuelle de la roue ─────────────────────────────────── */

function WheelPreview({
  segments,
}: {
  segments?: Array<{ label?: string; color?: string }>;
}) {
  if (!segments || segments.length === 0) {
    return (
      <div className="mx-auto mt-6 flex h-48 w-48 items-center justify-center rounded-full bg-cream text-4xl">
        🎰
      </div>
    );
  }
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = cx - 6;
  const slice = (2 * Math.PI) / segments.length;
  let angle = -Math.PI / 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto mt-6 drop-shadow-lg"
      role="img"
      aria-label="Aperçu de la roue"
    >
      <circle cx={cx} cy={cy} r={r + 4} fill="#1A1A1A" />
      {segments.map((seg, i) => {
        const x1 = cx + r * Math.cos(angle);
        const y1 = cy + r * Math.sin(angle);
        const end = angle + slice;
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const large = slice > Math.PI ? 1 : 0;
        const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`;
        const color = seg.color ?? (i % 2 === 0 ? "#C73E1D" : "#E6A12C");
        const result = (
          <path
            key={i}
            d={d}
            fill={color}
            stroke="#FFFFFF"
            strokeWidth={2}
          />
        );
        angle = end;
        return result;
      })}
      <circle cx={cx} cy={cy} r={18} fill="#F9F1E4" stroke="#C73E1D" strokeWidth={3} />
      <polygon
        points={`${cx - 10},4 ${cx + 10},4 ${cx},22`}
        fill="#C73E1D"
      />
    </svg>
  );
}

/* ─── Wrapper commun ──────────────────────────────────────────────── */

function StateWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="min-h-screen bg-cream pb-16 pt-20 md:pt-24">
        <div className="container-hero">
          <div className="mx-auto max-w-lg">
            <header className="mb-6">
              <span className="eyebrow">Rialto Club</span>
              <h2 className="mt-2 font-display text-lg font-semibold text-mute">
                Roue de la chance
              </h2>
            </header>
            {children}
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function BackHome() {
  return (
    <div className="mt-4 text-center">
      <Link href="/" className="text-sm text-mute underline hover:text-ink">
        ← Retour à l&apos;accueil
      </Link>
    </div>
  );
}
