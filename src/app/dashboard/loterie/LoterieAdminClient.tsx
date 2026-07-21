"use client";

/**
 * Écran Loterie — dashboard patron.
 * Tirage mensuel avec double confirmation, carte gagnant (code retrait,
 * « Lot remis »), réouverture, historique. Gère l'état « migration en
 * attente » (table lottery_draws en navette caisse).
 */

import { useCallback, useEffect, useState } from "react";

type Winner = {
  entry_id: string;
  first_name: string;
  phone_masked: string;
  ticket_number: number | null;
  claim_token: string | null;
  claimed_at: string | null;
};

type Draw = {
  id: string;
  month: string;
  drawn_at: string;
  winner: Winner | null;
};

type LotteryState = {
  lottery: {
    title: string;
    reward: string | null;
    is_active: boolean;
    draw_date: string | null;
  };
  participants_count: number;
  current_month: string;
  current_month_label: string;
  current_draw: Draw | null;
  history: Draw[];
  migration_pending: boolean;
};

export default function LoterieAdminClient() {
  const [state, setState] = useState<LotteryState | null>(null);
  const [error, setError] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/lottery", { cache: "no-store" });
      if (!res.ok) {
        setError(true);
        return;
      }
      const body = (await res.json()) as { ok: boolean } & LotteryState;
      if (body.ok) {
        setState(body);
        setError(false);
      }
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function draw() {
    if (acting) return;
    setActing(true);
    setActionMsg(null);
    try {
      const res = await fetch("/api/dashboard/lottery/draw", {
        method: "POST",
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) {
        setActionMsg(
          body.error === "deja_tire_ce_mois"
            ? "Le tirage de ce mois a déjà été effectué."
            : body.error === "aucun_participant"
              ? "Aucun participant à la loterie pour l'instant."
              : body.error === "migration_pending"
                ? "La migration lottery_draws n'est pas encore exécutée (navette en cours)."
                : "Tirage impossible. Réessayez.",
        );
      }
      setConfirming(false);
      await load();
    } catch {
      setActionMsg("Problème de connexion. Réessayez.");
    } finally {
      setActing(false);
    }
  }

  async function claim(entryId: string) {
    if (acting) return;
    setActing(true);
    try {
      await fetch("/api/dashboard/lottery/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entry_id: entryId }),
      });
      await load();
    } finally {
      setActing(false);
    }
  }

  async function reopen() {
    if (acting) return;
    setActing(true);
    try {
      await fetch("/api/dashboard/lottery/reopen", { method: "POST" });
      await load();
    } finally {
      setActing(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-4 text-sm font-medium text-rialto">
        Impossible de charger la loterie. Rechargez la page.
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
      </div>
    );
  }

  const drawnThisMonth = Boolean(state.current_draw);

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">Loterie</h1>

      {state.migration_pending && (
        <div className="rounded-2xl border border-saffron/50 bg-saffron/10 p-4 text-sm text-ink">
          ⏳ La table des tirages (<code>lottery_draws</code>) est en attente
          d&apos;exécution de migration (navette caisse). Le tirage sera
          possible dès qu&apos;elle sera passée.
        </div>
      )}

      {/* État loterie */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display font-semibold text-ink">
            {state.lottery.title}
          </h2>
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider ${
              state.lottery.is_active
                ? "bg-emerald-50 text-emerald-700"
                : "bg-ink/10 text-ink/60"
            }`}
          >
            {state.lottery.is_active ? "Active" : "Tirée"}
          </span>
        </div>
        {state.lottery.reward && (
          <p className="mt-1 text-sm text-mute">Lot : {state.lottery.reward}</p>
        )}
        <div className="mt-3 rounded-xl bg-cream p-3 text-center">
          <div className="font-display text-3xl font-bold text-ink">
            {state.participants_count}
          </div>
          <div className="text-xs text-mute">
            participant{state.participants_count > 1 ? "s" : ""} inscrit
            {state.participants_count > 1 ? "s" : ""} ce mois-ci
          </div>
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-xl border border-saffron/50 bg-saffron/10 p-3 text-sm font-medium text-ink">
          {actionMsg}
        </div>
      )}

      {/* Tirage du mois */}
      {!drawnThisMonth ? (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-mute">
            Tirage de {state.current_month_label}
          </h2>
          <p className="text-sm text-mute">
            Le tirage désigne un gagnant au hasard parmi les{" "}
            {state.participants_count} inscrit
            {state.participants_count > 1 ? "s" : ""} du mois. Un seul tirage
            possible par mois.
          </p>
          {!confirming ? (
            <button
              type="button"
              disabled={
                acting ||
                state.migration_pending ||
                state.participants_count === 0
              }
              onClick={() => setConfirming(true)}
              className="mt-4 w-full rounded-full bg-rialto py-3.5 font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-40"
            >
              Tirer le gagnant du mois
            </button>
          ) : (
            <div className="mt-4 space-y-2">
              <p className="text-center text-sm font-medium text-ink">
                Confirmer le tirage de {state.current_month_label} ?<br />
                <span className="text-xs text-mute">
                  Cette action est définitive pour le mois.
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="flex-1 rounded-full border border-border py-3 text-sm font-semibold text-ink/70"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={acting}
                  onClick={draw}
                  className="flex-1 rounded-full bg-rialto py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {acting ? "Tirage…" : "Oui, tirer"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <WinnerCard
          draw={state.current_draw!}
          monthLabel={state.current_month_label}
          onClaim={claim}
          acting={acting}
        />
      )}

      {/* Réouverture */}
      {!state.lottery.is_active && (
        <button
          type="button"
          disabled={acting}
          onClick={reopen}
          className="w-full rounded-full border border-border bg-white py-3 text-sm font-semibold text-ink/70 transition hover:bg-ink/5 disabled:opacity-50"
        >
          Rouvrir la loterie (mois suivant)
        </button>
      )}

      {/* Historique */}
      {state.history.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
            Historique des tirages
          </h2>
          <ul className="divide-y divide-border">
            {state.history.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2">
                <div>
                  <div className="text-sm font-semibold capitalize text-ink">
                    {new Date(d.month).toLocaleDateString("fr-CH", {
                      month: "long",
                      year: "numeric",
                    })}
                  </div>
                  <div className="text-xs text-mute">
                    {d.winner
                      ? `${d.winner.first_name} · ticket n° ${d.winner.ticket_number ?? "?"}`
                      : "Gagnant introuvable"}
                  </div>
                </div>
                {d.winner?.claimed_at ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-700">
                    Remis
                  </span>
                ) : (
                  <span className="rounded-full bg-saffron/20 px-2 py-0.5 text-[10px] font-bold uppercase text-ink/70">
                    En attente
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function WinnerCard({
  draw,
  monthLabel,
  onClaim,
  acting,
}: {
  draw: Draw;
  monthLabel: string;
  onClaim: (entryId: string) => void;
  acting: boolean;
}) {
  const w = draw.winner;
  if (!w) return null;
  return (
    <div className="rounded-2xl border-2 border-saffron bg-gradient-to-br from-saffron/15 to-cream p-5 shadow-card">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-ink/60">
        🎉 Gagnant de {monthLabel}
      </h2>
      <div className="mt-2 font-display text-2xl font-bold text-ink">
        {w.first_name}
      </div>
      <div className="text-sm text-mute">
        {w.phone_masked} · ticket n° {w.ticket_number ?? "?"}
      </div>
      {w.claim_token && (
        <div className="mt-3 rounded-xl border border-dashed border-ink/30 bg-white p-3 text-center">
          <div className="text-[10px] uppercase tracking-wider text-mute">
            Code de retrait (le client le voit sur sa page loterie)
          </div>
          <div className="font-display text-xl font-bold tracking-wider text-rialto">
            {w.claim_token}
          </div>
        </div>
      )}
      <div className="mt-3">
        {w.claimed_at ? (
          <div className="rounded-full bg-emerald-50 py-2.5 text-center text-sm font-semibold text-emerald-700">
            ✓ Lot remis le{" "}
            {new Date(w.claimed_at).toLocaleDateString("fr-CH", {
              timeZone: "Europe/Zurich",
              day: "2-digit",
              month: "2-digit",
            })}
          </div>
        ) : (
          <button
            type="button"
            disabled={acting}
            onClick={() => onClaim(w.entry_id)}
            className="w-full rounded-full bg-ink py-3 text-sm font-semibold text-white transition hover:bg-ink/80 disabled:opacity-50"
          >
            Lot remis au gagnant
          </button>
        )}
      </div>
    </div>
  );
}
