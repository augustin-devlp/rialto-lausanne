"use client";

/**
 * Page /rialto-club/roue — 5 états contextuels (Phase 7).
 *
 * A — can_spin=true : affiche la roue + bouton Tourner
 * B — review_required : ReviewGateModal (hack 60s ou mode normal)
 * C — frequency_wait : countdown jours + rappel code si valide
 * D — wrong_day : message + prochain créneau jour
 * E — disabled : "pas de roue prévue pour l'instant"
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteFooter from "@/components/home/SiteFooter";
import ReviewGateModal from "@/components/ReviewGateModal";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { readCustomerSession } from "@/lib/customerSession";

type State = "A" | "B" | "C" | "D" | "E";

type AvailabilityResponse = {
  state: State;
  can_spin: boolean;
  config_mode: "frequency" | "weekdays" | "disabled";
  message: string;
  last_prize: {
    code: string;
    description: string;
    used: boolean;
    expires_at: string | null;
  } | null;
  wait_info: {
    next_available_date: string;
    days_remaining: number;
  } | null;
  frequency_days: number | null;
  allowed_weekdays: number[];
  require_google_review: boolean;
};

const RIALTO_PLACE_ID = "ChIJrbzJL6cvjEcRHK7RrA9M3ic";

function formatDateFR(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("fr-CH", {
      day: "numeric",
      month: "long",
    });
  } catch {
    return iso;
  }
}

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
          state: "E",
          can_spin: false,
          config_mode: "disabled",
          message: "Erreur de chargement. Réessaye plus tard.",
          last_prize: null,
          wait_info: null,
          frequency_days: null,
          allowed_weekdays: [],
          require_google_review: false,
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
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/loyalty/spin`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone: session.phone,
          first_name: session.first_name,
        }),
      });
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

  /* ─── État E : roue désactivée ou pas de roue ─── */
  if (data.state === "E") {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl grayscale opacity-60">🎰</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Il n&apos;y a pas de roue prévue
          </h1>
          <p className="mt-3 text-base text-mute">
            Tu seras prévenu par SMS quand une nouvelle roue sera lancée.
          </p>
          <p className="mt-1 text-xs text-mute">
            Tous les membres Rialto Club sont automatiquement alertés.
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

  /* ─── État A : peut spinner (avec ou sans résultat) ─── */
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
          <div className="mx-auto mt-6 flex h-48 w-48 items-center justify-center rounded-full bg-gradient-to-br from-rialto to-rialto-dark text-6xl">
            🎰
          </div>
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

  /* ─── État B : doit laisser avis Google ─── */
  if (data.state === "B" && customerId) {
    return (
      <StateWrapper>
        <div className="rounded-3xl border-2 border-saffron bg-saffron/10 p-8 text-center md:p-10">
          <div className="text-5xl">⭐</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Un avis pour débloquer la roue
          </h1>
          <p className="mt-3 text-base text-ink/80">{data.message}</p>
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

  /* ─── État C : fréquence pas écoulée ─── */
  if (data.state === "C") {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">⏳</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Tu as déjà tourné la roue
          </h1>
          <p className="mt-3 text-base text-mute">{data.message}</p>
          {data.last_prize &&
            !data.last_prize.used &&
            data.last_prize.code && (
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
                {data.last_prize.expires_at && (
                  <div className="mt-1 text-xs text-emerald-700">
                    Valable jusqu&apos;au {formatDateFR(data.last_prize.expires_at)}
                  </div>
                )}
              </div>
            )}
          {data.last_prize?.used && data.last_prize.code && (
            <div className="mt-6 rounded-xl bg-cream p-3 text-xs text-mute">
              Ton dernier code (<strong>{data.last_prize.code}</strong>) a déjà
              été utilisé.
            </div>
          )}
          <p className="mt-4 text-xs text-mute">
            Tu seras automatiquement prévenu par SMS dès que tu peux retenter.
          </p>
          <Link href="/menu" className="btn-ghost mt-6">
            Voir le menu
          </Link>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ─── État D : pas le bon jour (mode weekdays) ─── */
  if (data.state === "D") {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">📅</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            La roue n&apos;est pas disponible aujourd&apos;hui
          </h1>
          <p className="mt-3 text-base text-mute">{data.message}</p>
          {data.wait_info && data.wait_info.days_remaining > 0 && (
            <div className="mt-5 rounded-2xl bg-saffron/15 p-4 text-sm">
              <div className="text-xs font-semibold uppercase tracking-wider text-saffron-dark">
                Prochain créneau
              </div>
              <div className="mt-1 font-display text-lg font-bold text-ink">
                {formatDateFR(data.wait_info.next_available_date)}
              </div>
              <div className="text-xs text-mute">
                Dans {data.wait_info.days_remaining} jour
                {data.wait_info.days_remaining > 1 ? "s" : ""}
              </div>
            </div>
          )}
          {data.last_prize &&
            !data.last_prize.used &&
            data.last_prize.code && (
              <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-left">
                <div className="text-xs text-emerald-700">
                  Rappel : ton code{" "}
                  <strong className="font-mono">{data.last_prize.code}</strong>
                  {" "}
                  ({data.last_prize.description}) est encore valable.
                </div>
              </div>
            )}
          <p className="mt-4 text-xs text-mute">
            Tu seras automatiquement prévenu par SMS.
          </p>
          <Link href="/menu" className="btn-ghost mt-6">
            Voir le menu
          </Link>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  return null;
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
