"use client";

/**
 * Porte d'entrée PIN du dashboard patron.
 * Au mount : GET /api/dashboard/login (cookie httpOnly → check serveur).
 * Sans session : écran PIN plein écran (pattern /scan, charte Rialto).
 * Avec session : rend les enfants.
 */

import { useEffect, useState, type ReactNode } from "react";

type Phase = "checking" | "pin" | "authed" | "not_configured";

export default function PinGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/login", { cache: "no-store" });
        if (cancelled) return;
        if (res.ok) setPhase("authed");
        else if (res.status === 500) setPhase("not_configured");
        else setPhase("pin");
      } catch {
        if (!cancelled) setPhase("pin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pin.length < 4 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        setPhase("authed");
      } else if (res.status === 429) {
        setError("Trop de tentatives. Attendez une minute puis réessayez.");
      } else {
        setError("Code incorrect.");
        setPin("");
      }
    } catch {
      setError("Problème de connexion. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "authed") return <>{children}</>;

  if (phase === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
      </div>
    );
  }

  if (phase === "not_configured") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cream px-6">
        <div className="max-w-sm rounded-2xl border border-border bg-white p-6 text-center shadow-card">
          <div className="mb-3 text-3xl">⚙️</div>
          <h1 className="font-display text-lg font-bold text-ink">
            Dashboard non configuré
          </h1>
          <p className="mt-2 text-sm text-mute">
            Les variables DASHBOARD_PIN et DASHBOARD_COOKIE_SECRET manquent
            côté serveur.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-3xl border border-border bg-white p-8 text-center shadow-card"
      >
        <div className="mb-2 font-display text-2xl font-bold text-rialto">
          Rialto
        </div>
        <h1 className="font-display text-lg font-semibold text-ink">
          Espace restaurateur
        </h1>
        <p className="mt-1 text-sm text-mute">
          Entrez votre code d&apos;accès.
        </p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="••••"
          className="mt-5 w-full rounded-xl border-2 border-border px-4 py-3 text-center text-2xl tracking-[0.5em] focus:border-rialto focus:outline-none"
          autoFocus
        />
        {error && <p className="mt-3 text-sm font-medium text-rialto">{error}</p>}
        <button
          type="submit"
          disabled={pin.length < 4 || submitting}
          className="mt-5 w-full rounded-full bg-rialto py-3.5 font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-40"
        >
          {submitting ? "Vérification…" : "Entrer"}
        </button>
      </form>
    </div>
  );
}
