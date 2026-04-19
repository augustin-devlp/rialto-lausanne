"use client";

import { useState } from "react";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type Lottery = {
  id: string;
  title: string;
  reward_description: string;
  draw_date: string | null;
  is_permanent: boolean;
  already_entered: boolean;
};

type Props = {
  lottery: Lottery;
  phone: string;
  firstName: string;
  onClose: () => void;
};

function formatDate(iso: string | null): string {
  if (!iso) return "à définir";
  try {
    return new Date(iso).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function LotteryEntry({
  lottery,
  phone,
  firstName,
  onClose,
}: Props) {
  const [entered, setEntered] = useState(lottery.already_entered);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function enter() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/loyalty/lottery/enter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, first_name: firstName }),
        },
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? `Erreur ${res.status}`);
        return;
      }
      setEntered(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-2 text-gray-400 hover:bg-gray-50"
        >
          ✕
        </button>

        <div className="text-center">
          <div className="text-4xl">🎁</div>
          <h3 className="mt-2 text-lg font-black tracking-tight">
            {lottery.title}
          </h3>
          <p className="mt-1 text-sm text-mute">{lottery.reward_description}</p>
          {!lottery.is_permanent && lottery.draw_date && (
            <p className="mt-2 text-xs text-mute">
              Tirage le <strong>{formatDate(lottery.draw_date)}</strong>
            </p>
          )}
        </div>

        {entered ? (
          <div className="mt-6 rounded-xl bg-emerald-50 p-4 text-center">
            <div className="text-2xl">✓</div>
            <p className="mt-1 text-sm font-semibold text-emerald-900">
              Vous participez !
            </p>
            <p className="mt-1 text-xs text-emerald-900/70">
              Nous vous contacterons en cas de gain.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Fermer
            </button>
          </div>
        ) : (
          <>
            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {error}
              </div>
            )}
            <button
              type="button"
              onClick={enter}
              disabled={busy}
              className="mt-6 w-full rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white hover:bg-rialto-dark disabled:opacity-50"
            >
              {busy ? "…" : "Participer (gratuit)"}
            </button>
            <p className="mt-2 text-center text-[11px] text-mute">
              Une seule participation par numéro de téléphone.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
