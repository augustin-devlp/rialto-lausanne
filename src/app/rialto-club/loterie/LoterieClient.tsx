"use client";

/**
 * Page /rialto-club/loterie — 5 états contextuels.
 * Voir brief Phase 6 FIX 3 : A/B/C/D/E.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteFooter from "@/components/home/SiteFooter";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { readCustomerSession } from "@/lib/customerSession";

type State = "A" | "B" | "C" | "D" | "E";

type LotteryData = {
  state: State;
  lottery: {
    id: string;
    title: string;
    prize_description: string | null;
    reward_description: string | null;
    draw_date: string | null;
  } | null;
  ticket?: {
    number: number;
    entry_id: string;
    claim_token?: string | null;
    claimed_at?: string | null;
  } | null;
  result?: {
    won: boolean;
    winner_ticket: number | null;
  } | null;
};

function formatDrawDate(iso: string | null): string {
  if (!iso) return "prochainement";
  try {
    return new Date(iso).toLocaleDateString("fr-CH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function LotterieClient() {
  const [data, setData] = useState<LotteryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(true);

  useEffect(() => {
    const session = readCustomerSession();
    if (!session) {
      setAuthed(false);
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const url = new URL(`${STAMPIFY_BASE}/api/lottery/current`);
        url.searchParams.set("customer_id", session.customer_id);
        const res = await fetch(url.toString(), { cache: "no-store" });
        if (!res.ok) {
          setData({ state: "E", lottery: null });
          return;
        }
        const body = (await res.json()) as LotteryData;
        setData(body);
      } catch {
        setData({ state: "E", lottery: null });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (!authed) {
    return (
      <>
        <main className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 pt-20 md:pt-24">
          <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-rialto/10 text-4xl">
              🎟️
            </div>
            <h1 className="font-display text-h2 font-bold">La loterie Rialto</h1>
            <p className="mt-3 text-base text-mute">
              Tous les mois, un tirage au sort parmi les membres Rialto Club.
              Rejoins gratuitement pour participer à chaque commande.
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

  const lottery = data.lottery;

  /* ═══════════════════════ ÉTAT A : participe déjà ═══════════════════════ */
  if (data.state === "A" && lottery && data.ticket) {
    return (
      <StateWrapper>
        <div className="rounded-3xl bg-gradient-to-br from-saffron to-saffron-dark p-8 text-center text-ink shadow-pop md:p-10">
          <div className="text-5xl">🎟️</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Tu participes !
          </h1>
          <p className="mt-2 text-base">
            {lottery.title ?? "Loterie Rialto"}
          </p>
          <div className="mt-8 rounded-2xl bg-white/90 p-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-rialto">
              Ton ticket
            </div>
            <div className="tabular mt-2 font-display text-6xl font-bold text-rialto">
              n°{String(data.ticket.number).padStart(4, "0")}
            </div>
          </div>
          <div className="mt-6 rounded-2xl bg-white/70 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-ink/70">
              À gagner
            </div>
            <div className="mt-1 font-display text-lg font-bold">
              {lottery.prize_description ?? lottery.reward_description ?? "Un lot à découvrir"}
            </div>
          </div>
          <div className="mt-4 text-sm">
            Tirage le{" "}
            <strong>{formatDrawDate(lottery.draw_date)}</strong>
          </div>
          <button
            type="button"
            onClick={() => {
              const url = `${window.location.origin}/rialto-club/loterie`;
              void navigator.clipboard.writeText(url);
            }}
            className="mt-6 text-xs font-semibold text-ink underline"
          >
            Partager avec un ami
          </button>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ═══════════════════════ ÉTAT B : a perdu ═══════════════════════════════ */
  if (data.state === "B" && lottery && data.ticket && data.result) {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">😔</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Pas de chance cette fois
          </h1>
          <p className="mt-2 text-base text-mute">
            Ton ticket <strong>n°{String(data.ticket.number).padStart(4, "0")}</strong>{" "}
            n&apos;a pas été tiré sur la loterie{" "}
            <em>{lottery.title ?? "Rialto"}</em>.
          </p>
          {data.result.winner_ticket != null && (
            <p className="mt-3 text-sm text-mute">
              Le gagnant était le{" "}
              <strong className="text-ink">
                n°{String(data.result.winner_ticket).padStart(4, "0")}
              </strong>
              . Félicitations à lui !
            </p>
          )}
          <div className="mt-6 rounded-2xl bg-cream p-4 text-sm">
            🔔 <strong>Prochaine loterie bientôt !</strong>
            <br />
            <span className="text-mute">
              Tous les membres Rialto Club sont prévenus par SMS dès qu&apos;une
              nouvelle loterie est lancée.
            </span>
          </div>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ═══════════════════════ ÉTAT C : a gagné ═══════════════════════════════ */
  if (data.state === "C" && lottery && data.ticket) {
    const claimed = !!data.ticket.claimed_at;
    return (
      <StateWrapper>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rialto to-rialto-dark p-8 text-center text-white shadow-pop md:p-10">
          {/* Confettis statiques en fond */}
          <div
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(circle at 10% 20%, #E6A12C 2px, transparent 3px), radial-gradient(circle at 85% 60%, #F9F1E4 2px, transparent 3px), radial-gradient(circle at 50% 80%, #E6A12C 2px, transparent 3px)",
              backgroundSize: "60px 60px, 80px 80px, 90px 90px",
            }}
          />
          <div className="relative">
            <div className="text-6xl">🎉</div>
            <h1 className="mt-4 font-display text-h1 font-bold uppercase">
              Tu as gagné !
            </h1>
            <p className="mt-2 text-base text-white/90">
              Loterie {lottery.title ?? "Rialto"}
            </p>
            <div className="mt-6 rounded-2xl bg-white p-5 text-ink">
              <div className="text-xs font-semibold uppercase tracking-wider text-rialto">
                Ton ticket gagnant
              </div>
              <div className="tabular mt-1 font-display text-4xl font-bold">
                n°{String(data.ticket.number).padStart(4, "0")}
              </div>
              <div className="mt-4 border-t border-border pt-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-mute">
                  Prix
                </div>
                <div className="mt-1 font-display text-xl font-bold text-rialto">
                  {lottery.prize_description ??
                    lottery.reward_description ??
                    "À découvrir chez Rialto"}
                </div>
              </div>
              {data.ticket.claim_token && (
                <div className="mt-4 rounded-xl bg-cream p-3 text-xs">
                  <div className="font-semibold text-ink">Code de retrait</div>
                  <div className="tabular mt-1 font-mono text-base text-rialto">
                    {data.ticket.claim_token}
                  </div>
                </div>
              )}
            </div>
            <p className="mt-5 text-sm text-white/90">
              Présente ton ticket (ou ce code) au restaurant pour réclamer ton
              lot.
            </p>
            {claimed && (
              <div className="mt-4 rounded-xl bg-emerald-500/30 py-2 text-sm font-semibold">
                ✓ Lot réclamé le{" "}
                {new Date(data.ticket.claimed_at!).toLocaleDateString("fr-CH")}
              </div>
            )}
          </div>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ═══════════════════════ ÉTAT D : loterie active, pas encore participé ═ */
  if (data.state === "D" && lottery) {
    return (
      <StateWrapper>
        <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
          <div className="text-5xl">🎟️</div>
          <h1 className="mt-4 font-display text-h1 font-bold">
            Une loterie est en cours
          </h1>
          <div className="mt-5 rounded-2xl bg-saffron/15 p-5">
            <div className="text-xs font-semibold uppercase tracking-wider text-saffron-dark">
              À gagner
            </div>
            <div className="mt-1 font-display text-2xl font-bold text-rialto">
              {lottery.prize_description ??
                lottery.reward_description ??
                "Un lot à découvrir"}
            </div>
            <div className="mt-3 text-sm text-ink/80">
              Tirage le <strong>{formatDrawDate(lottery.draw_date)}</strong>
            </div>
          </div>
          <p className="mt-5 text-sm text-mute">
            <strong className="text-ink">Comment participer ?</strong> Passe une
            commande et tu recevras automatiquement 1 ticket.
          </p>
          <Link href="/menu" className="btn-primary-lg mt-5 w-full">
            Commander maintenant →
          </Link>
        </div>
        <BackHome />
      </StateWrapper>
    );
  }

  /* ═══════════════════════ ÉTAT E : aucune loterie active ═══════════════ */
  return (
    <StateWrapper>
      <div className="rounded-3xl border border-border bg-white p-8 text-center shadow-card md:p-10">
        <div className="text-5xl">🎟️</div>
        <h1 className="mt-4 font-display text-h1 font-bold">
          Pas de loterie en ce moment
        </h1>
        <p className="mt-3 text-base text-mute">
          La prochaine arrive bientôt. Tu seras automatiquement prévenu par
          SMS dès qu&apos;elle sera lancée — <strong className="text-ink">tous les
          membres Rialto Club</strong> reçoivent l&apos;info.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/rialto-club/roue" className="btn-primary">
            🎰 Voir la roue
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
                Loterie mensuelle
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
