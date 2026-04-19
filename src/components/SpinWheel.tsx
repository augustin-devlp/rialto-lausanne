"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import confetti from "canvas-confetti";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

// react-custom-roulette touche window -> SSR disabled
const Wheel = dynamic(
  () => import("react-custom-roulette").then((m) => m.Wheel),
  { ssr: false },
);

type Segment = {
  label: string;
  color?: string;
};

type Props = {
  phone: string;
  firstName: string;
  segments: Segment[];
  canSpin: boolean;
  lastReward?: string | null;
  onClose: () => void;
};

type SpinResult = {
  segment_index: number;
  reward: string;
  color: string | null;
  code: string;
};

const PALETTE = ["#E30613", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6", "#6B7280", "#EC4899", "#14B8A6"];

function isLoser(reward: string): boolean {
  const lower = reward.toLowerCase();
  return /perd|perdu|dommage|tente|ressa|r[eé]essa|aucun|pas de|rien/.test(lower);
}

/**
 * Roue de la chance basée sur react-custom-roulette (battle-tested).
 * Le serveur décide du segment gagnant ; on passe prizeNumber au Wheel
 * pour qu'il ralentisse pile dessus.
 */
export default function SpinWheel({
  phone,
  firstName,
  segments,
  canSpin,
  lastReward,
  onClose,
}: Props) {
  const data = segments.map((seg, i) => ({
    option: seg.label.slice(0, 18),
    style: {
      backgroundColor: seg.color ?? PALETTE[i % PALETTE.length],
      textColor: "#ffffff",
    },
  }));

  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function startSpin() {
    if (mustSpin || busy || !canSpin) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/loyalty/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, first_name: firstName }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? `Erreur ${res.status}`);
        setBusy(false);
        return;
      }
      const body = (await res.json()) as SpinResult;
      setPrizeNumber(Math.max(0, Math.min(segments.length - 1, body.segment_index)));
      setResult(body);
      setMustSpin(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
      setBusy(false);
    }
  }

  function handleStop() {
    setMustSpin(false);
    setBusy(false);
    if (result && !isLoser(result.reward)) {
      // Confettis !
      const duration = 2000;
      const end = Date.now() + duration;
      const frame = () => {
        confetti({
          particleCount: 4,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors: ["#E30613", "#F59E0B", "#10B981"],
        });
        confetti({
          particleCount: 4,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors: ["#E30613", "#F59E0B", "#10B981"],
        });
        if (Date.now() < end) requestAnimationFrame(frame);
      };
      frame();
    }
  }

  async function copyCode() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const showResult = !mustSpin && result !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-2 text-gray-400 hover:bg-gray-50"
        >
          ✕
        </button>

        {!showResult && (
          <>
            <h3 className="mb-1 text-center text-lg font-black tracking-tight">
              🎰 Roue de la chance
            </h3>
            <p className="mb-4 text-center text-xs text-mute">
              Tentez votre chance — un tour par client.
            </p>

            <div className="mx-auto flex w-full justify-center">
              {data.length > 0 && (
                <Wheel
                  mustStartSpinning={mustSpin}
                  prizeNumber={prizeNumber}
                  data={data}
                  outerBorderColor="#1a1a1a"
                  outerBorderWidth={5}
                  innerBorderColor="#ffffff"
                  innerBorderWidth={2}
                  innerRadius={25}
                  radiusLineColor="#ffffff"
                  radiusLineWidth={2}
                  fontSize={14}
                  textDistance={60}
                  spinDuration={0.6}
                  onStopSpinning={handleStop}
                />
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {error}
              </div>
            )}

            {!canSpin && !error && (
              <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-center text-xs text-gray-600">
                {lastReward
                  ? `Vous avez déjà tenté la roue et gagné « ${lastReward} ».`
                  : "Vous avez déjà utilisé votre spin."}
              </div>
            )}

            <button
              type="button"
              onClick={startSpin}
              disabled={busy || !canSpin}
              className="mt-6 w-full rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white transition hover:bg-rialto-dark disabled:opacity-50"
            >
              {busy ? "La roue tourne…" : "Lancer la roue"}
            </button>
          </>
        )}

        {showResult && result && (
          <div className="text-center">
            <div className="text-5xl">{isLoser(result.reward) ? "🥲" : "🎉"}</div>
            <h3 className="mt-3 text-xl font-black tracking-tight">
              {isLoser(result.reward) ? "Pas cette fois !" : "Vous avez gagné !"}
            </h3>
            <div className="mt-2 rounded-xl bg-gradient-to-br from-rialto to-rialto-dark p-4 text-white">
              <div className="text-xs font-semibold uppercase tracking-wider opacity-80">
                Résultat
              </div>
              <div className="mt-1 text-2xl font-black">{result.reward}</div>
            </div>
            {!isLoser(result.reward) && (
              <>
                <div className="mt-4 rounded-lg bg-gray-900 p-4 text-center">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Code à présenter en caisse
                  </div>
                  <div className="mt-1 font-mono text-xl font-bold tracking-wider text-white">
                    {result.code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="mt-3 w-full rounded-full border border-gray-300 px-4 py-2.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  {copied ? "✓ Copié" : "📋 Copier le code"}
                </button>
              </>
            )}
            {isLoser(result.reward) && (
              <p className="mt-4 text-sm text-mute">
                Tentez à nouveau lors de votre prochaine commande.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white hover:bg-rialto-dark"
            >
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
