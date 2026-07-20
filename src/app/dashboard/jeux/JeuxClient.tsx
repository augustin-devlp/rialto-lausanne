"use client";

/**
 * Écran Jeux — réconciliation roue + loterie (D3).
 * Sources uniques documentées à l'écran : les codes promo (vérité des
 * gains convertibles) + compteurs participations. Le tirage loterie
 * vit sur son propre écran (lien).
 */

import Link from "next/link";
import { useEffect, useState } from "react";

type CodeRow = {
  code: string;
  source: "spin_wheel" | "lottery";
  phone_masked: string | null;
  gain: string;
  statut: "utilise" | "actif" | "expire";
  emis_le: string;
  valable_jusqu_au: string;
  utilise_le: string | null;
  commande: string | null;
};

type JeuxState = {
  roue: { spins: number; resultats_journal: number };
  loterie: { participants: number; gagnants: number };
  codes: CodeRow[];
  stats: {
    codes_emis: number;
    codes_utilises: number;
    codes_actifs: number;
    codes_expires: number;
  };
};

const STATUT_LABEL: Record<CodeRow["statut"], string> = {
  utilise: "Utilisé",
  actif: "Actif",
  expire: "Expiré",
};

function statutChip(s: CodeRow["statut"]): string {
  switch (s) {
    case "utilise":
      return "bg-emerald-50 text-emerald-700";
    case "actif":
      return "bg-saffron/20 text-ink/80";
    case "expire":
      return "bg-ink/10 text-ink/50";
  }
}

export default function JeuxClient() {
  const [state, setState] = useState<JeuxState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/jeux", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const body = (await res.json()) as { ok: boolean } & JeuxState;
        if (body.ok) setState(body);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-4 text-sm font-medium text-rialto">
        Impossible de charger les jeux. Rechargez la page.
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

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">Jeux</h1>

      {/* Compteurs */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-wider text-mute">
            🎡 Roue cadeau
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-ink">
            {state.roue.spins}
          </div>
          <div className="text-xs text-mute">
            tour{state.roue.spins > 1 ? "s" : ""} joué
            {state.roue.spins > 1 ? "s" : ""}
          </div>
        </div>
        <Link
          href="/dashboard/loterie"
          className="rounded-2xl border border-border bg-white p-4 transition hover:shadow-pop"
        >
          <div className="text-xs font-semibold uppercase tracking-wider text-mute">
            🎟 Loterie →
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-ink">
            {state.loterie.participants}
          </div>
          <div className="text-xs text-mute">
            inscrit{state.loterie.participants > 1 ? "s" : ""} ·{" "}
            {state.loterie.gagnants} gagnant
            {state.loterie.gagnants > 1 ? "s" : ""}
          </div>
        </Link>
      </div>

      {/* Stats codes */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
          Codes gagnés (roue + loterie)
        </h2>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="font-display text-xl font-bold text-ink">
              {state.stats.codes_emis}
            </div>
            <div className="text-[10px] text-mute">Émis</div>
          </div>
          <div>
            <div className="font-display text-xl font-bold text-emerald-700">
              {state.stats.codes_utilises}
            </div>
            <div className="text-[10px] text-mute">Utilisés</div>
          </div>
          <div>
            <div className="font-display text-xl font-bold text-ink">
              {state.stats.codes_actifs}
            </div>
            <div className="text-[10px] text-mute">Actifs</div>
          </div>
          <div>
            <div className="font-display text-xl font-bold text-ink/50">
              {state.stats.codes_expires}
            </div>
            <div className="text-[10px] text-mute">Expirés</div>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-mute">
          Source unique : les codes promo générés par les jeux. Les gains
          loterie « code de retrait » (sans code promo) se gèrent sur
          l&apos;écran Loterie — pas de double comptage.
        </p>
      </div>

      {/* Liste des codes */}
      {state.codes.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-mute">
          Aucun code gagné pour l&apos;instant. Les gains de la roue
          apparaîtront ici.
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
            Détail des codes
          </h2>
          <ul className="divide-y divide-border">
            {state.codes.map((c) => (
              <li key={c.code} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-bold tracking-wide text-ink">
                    {c.code}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statutChip(c.statut)}`}
                  >
                    {STATUT_LABEL[c.statut]}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-mute">
                  {c.source === "spin_wheel" ? "🎡 Roue" : "🎟 Loterie"} ·{" "}
                  {c.gain}
                  {c.phone_masked && ` · ${c.phone_masked}`}
                </div>
                <div className="mt-0.5 text-[11px] text-mute">
                  {c.statut === "utilise" && c.commande
                    ? `Utilisé sur la commande ${c.commande}`
                    : c.statut === "actif"
                      ? `Valable jusqu'au ${new Date(c.valable_jusqu_au).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich", day: "2-digit", month: "2-digit", year: "numeric" })}`
                      : c.statut === "expire"
                        ? "Expiré sans être utilisé"
                        : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
