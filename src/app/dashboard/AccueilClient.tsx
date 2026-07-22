"use client";

/**
 * Accueil dashboard patron : chiffres du jour (Europe/Zurich) +
 * raccourcis. Rafraîchi toutes les 30 s.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCHF } from "@/lib/format";

type Summary = {
  orders: number;
  active: number;
  newCount: number;
  revenue: number;
};

export default function AccueilClient() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/dashboard/summary", { cache: "no-store" });
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const body = (await res.json()) as { ok: boolean; today: Summary };
        if (body.ok) {
          setSummary(body.today);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-bold text-ink">
        Aujourd&apos;hui
      </h1>

      {error && (
        <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-4 text-sm font-medium text-rialto">
          Impossible de charger les chiffres. Vérifiez la connexion puis
          rechargez la page.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Commandes du jour"
          value={summary ? String(summary.orders) : "—"}
        />
        <StatCard
          label="Chiffre du jour"
          value={summary ? formatCHF(summary.revenue) : "—"}
        />
        <StatCard
          label="En cours"
          value={summary ? String(summary.active) : "—"}
          accent={Boolean(summary && summary.active > 0)}
        />
        <StatCard
          label="Nouvelles"
          value={summary ? String(summary.newCount) : "—"}
          accent={Boolean(summary && summary.newCount > 0)}
        />
      </div>

      <div className="space-y-3">
        <Link
          href="/dashboard/commandes"
          className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-card transition hover:shadow-pop"
        >
          <div>
            <div className="font-display font-semibold text-ink">
              Voir les commandes
            </div>
            <div className="text-xs text-mute">
              Détail, adresse, paiement — consultation
            </div>
          </div>
          <Arrow />
        </Link>
        <Link
          href="/dashboard/push"
          className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-card transition hover:shadow-pop"
        >
          <div>
            <div className="font-display font-semibold text-ink">
              Envoyer une notification
            </div>
            <div className="text-xs text-mute">
              Promo ou annonce, à tous les clients abonnés
            </div>
          </div>
          <Arrow />
        </Link>
        <Link
          href="/dashboard/fidelite"
          className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-card transition hover:shadow-pop"
        >
          <div>
            <div className="font-display font-semibold text-ink">
              Fidélité
            </div>
            <div className="text-xs text-mute">
              Barème des tampons sur les commandes en ligne
            </div>
          </div>
          <Arrow />
        </Link>
        <Link
          href="/dashboard/jeux"
          className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-card transition hover:shadow-pop"
        >
          <div>
            <div className="font-display font-semibold text-ink">
              Jeux (roue + loterie)
            </div>
            <div className="text-xs text-mute">
              Codes gagnés, utilisés, expirés
            </div>
          </div>
          <Arrow />
        </Link>
        <Link
          href="/dashboard/parrainage"
          className="flex items-center justify-between rounded-2xl border border-border bg-white p-4 shadow-card transition hover:shadow-pop"
        >
          <div>
            <div className="font-display font-semibold text-ink">
              Parrainage
            </div>
            <div className="text-xs text-mute">
              Codes −100 % des deux côtés, SMS, filleuls
            </div>
          </div>
          <Arrow />
        </Link>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        accent
          ? "border-rialto/40 bg-rialto/5"
          : "border-border bg-white"
      }`}
    >
      <div
        className={`font-display text-2xl font-bold ${
          accent ? "text-rialto" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="mt-0.5 text-xs text-mute">{label}</div>
    </div>
  );
}

function Arrow() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-mute" aria-hidden>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
