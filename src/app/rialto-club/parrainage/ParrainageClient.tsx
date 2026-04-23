"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import SiteFooter from "@/components/home/SiteFooter";
import { readCustomerSession } from "@/lib/customerSession";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type Stats = {
  ok: boolean;
  code: string | null;
  totals: Record<string, number>;
  total: number;
  history: Array<{
    id: string;
    status: string;
    referee_phone: string | null;
    created_at: string;
    rewarded_at: string | null;
  }>;
};

export default function ParrainageClient() {
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [enteringCode, setEnteringCode] = useState("");
  const [claimMsg, setClaimMsg] = useState<string | null>(null);

  useEffect(() => {
    const session = readCustomerSession();
    if (!session) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await fetch(
          `${STAMPIFY_BASE}/api/rialto/loyalty/lookup?phone=${encodeURIComponent(session.phone)}`,
        );
        if (r.ok) {
          const body = (await r.json()) as {
            customer?: { id: string } | null;
          };
          if (body.customer) setCustomerId(body.customer.id);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!customerId) return;
    (async () => {
      try {
        const [genRes, statsRes] = await Promise.all([
          fetch(`${STAMPIFY_BASE}/api/rialto/referrals/generate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ customer_id: customerId }),
          }),
          fetch(
            `${STAMPIFY_BASE}/api/rialto/referrals/stats?customer_id=${customerId}`,
          ),
        ]);
        const g = await genRes.json();
        const s = await statsRes.json();
        if (g.ok) setCode(g.code);
        if (s.ok) setStats(s);
      } catch (err) {
        console.error("[parrainage] load failed", err);
      }
    })();
  }, [customerId]);

  async function handleCopy() {
    if (!code) return;
    try {
      const shareUrl = `${window.location.origin}/rialto-club/parrainage?code=${code}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  async function handleShare() {
    if (!code) return;
    const shareUrl = `${window.location.origin}/rialto-club/parrainage?code=${code}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Rialto — Pizza Marguerite offerte",
          text: `Teste Rialto (Lausanne) avec mon code ${code} — ta 1re pizza Marguerite est offerte !`,
          url: shareUrl,
        });
      } catch {
        /* cancelled */
      }
    } else {
      handleCopy();
    }
  }

  async function handleClaim() {
    setClaimMsg(null);
    const session = readCustomerSession();
    if (!session) {
      setClaimMsg("Connecte-toi d'abord à Rialto Club pour utiliser un code.");
      return;
    }
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/referrals/claim`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: enteringCode.trim().toUpperCase(),
          phone: session.phone,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setClaimMsg(body.error ?? "Erreur");
      } else {
        setClaimMsg(
          body.message ??
            "Code enregistré ! Ta 1re pizza Marguerite est offerte après commande.",
        );
        setEnteringCode("");
      }
    } catch {
      setClaimMsg("Erreur réseau.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-cream pb-16 pt-20">
        <div className="container-hero text-center text-mute">Chargement…</div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-cream pb-16 pt-20 md:pt-24">
        <div className="container-hero max-w-2xl">
          <Link
            href="/rialto-club/connexion"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"
          >
            ← Retour Rialto Club
          </Link>

          <header className="mb-6">
            <span className="eyebrow">Rialto Club</span>
            <h1 className="mt-3 font-display text-h1 font-bold">
              Parrainage 🤝
            </h1>
            <p className="mt-2 text-base text-mute">
              Offre une <strong>Pizza Marguerite</strong> à tes amis chez
              Rialto. Quand ils passent leur 1re commande, ils en reçoivent
              une <em>et toi aussi</em>.
            </p>
          </header>

          {!customerId ? (
            <div className="rounded-3xl border border-border bg-white p-6 text-center shadow-card">
              <div className="mb-3 text-4xl">🔑</div>
              <p className="mt-2 text-sm text-mute">
                Pour parrainer, connecte-toi à ton compte Rialto Club.
              </p>
              <Link href="/rialto-club/connexion" className="btn-primary mt-4">
                Me connecter
              </Link>
            </div>
          ) : (
            <>
              {/* Ton code */}
              <section className="mb-6 rounded-3xl bg-gradient-to-br from-rialto to-rialto-dark p-6 text-white shadow-pop">
                <div className="text-xs font-semibold uppercase tracking-wider text-saffron">
                  Ton code de parrainage
                </div>
                <div className="mt-2 font-mono text-3xl font-black tracking-wider">
                  {code ?? "…"}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-full bg-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/30"
                    disabled={!code}
                  >
                    {copied ? "✓ Copié !" : "📋 Copier le lien"}
                  </button>
                  <button
                    type="button"
                    onClick={handleShare}
                    className="rounded-full bg-white text-rialto px-4 py-2 text-sm font-bold transition hover:bg-saffron"
                    disabled={!code}
                  >
                    📤 Partager
                  </button>
                </div>
              </section>

              {/* Stats */}
              {stats && (
                <section className="mb-6 grid grid-cols-3 gap-3">
                  <StatCard
                    label="En cours"
                    value={stats.totals.claimed ?? 0}
                    sub="1re commande attendue"
                  />
                  <StatCard
                    label="Réussis"
                    value={stats.totals.rewarded ?? 0}
                    sub="Pizzas offertes"
                  />
                  <StatCard
                    label="Total"
                    value={stats.total}
                    sub="Filleuls"
                  />
                </section>
              )}

              {/* Historique */}
              {stats && stats.history.length > 0 && (
                <section className="mb-6">
                  <h2 className="mb-2 font-display text-lg font-bold">
                    Mes filleuls
                  </h2>
                  <ul className="space-y-1.5">
                    {stats.history.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between rounded-xl border border-border bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-xs text-mute">
                          {(h.referee_phone ?? "").slice(0, -6)}
                          XX XX{" "}
                          {(h.referee_phone ?? "").slice(-2)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            h.status === "rewarded"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {h.status === "rewarded"
                            ? "✓ Récompensé"
                            : "En attente"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}

          {/* Saisir un code (filleul) */}
          <section className="rounded-3xl border-2 border-saffron bg-[#FFF7E4] p-5">
            <h2 className="font-display text-lg font-bold">
              🎁 Tu as un code de parrainage ?
            </h2>
            <p className="mt-1 text-sm text-mute">
              Saisis-le et ta 1re pizza Marguerite est offerte (après ta 1re
              commande Rialto).
            </p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={enteringCode}
                onChange={(e) => setEnteringCode(e.target.value.toUpperCase())}
                placeholder="Ex: RIA-A3F2B"
                className="flex-1 rounded-xl border-2 border-border bg-white px-4 py-2.5 text-center font-mono text-sm font-bold uppercase tracking-wider"
              />
              <button
                type="button"
                onClick={handleClaim}
                disabled={!enteringCode.trim()}
                className="btn-primary disabled:opacity-50"
              >
                Utiliser
              </button>
            </div>
            {claimMsg && (
              <div className="mt-3 rounded-xl bg-white p-3 text-xs text-ink">
                {claimMsg}
              </div>
            )}
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-white p-3 text-center shadow-card">
      <div className="text-[10px] font-bold uppercase tracking-wider text-mute">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-black text-rialto">
        {value}
      </div>
      <div className="text-[10px] text-mute">{sub}</div>
    </div>
  );
}
