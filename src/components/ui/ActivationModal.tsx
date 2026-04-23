"use client";

/**
 * ActivationModal — 2e étape de l'activation carte fidélité (Phase 11 C1).
 *
 * Affiché via bandeau sur /c/[shortCode] si la carte n'est pas encore
 * `is_fully_activated`. Le client renseigne :
 *   - Date d'anniversaire (obligatoire, ≥ 18 ans)
 *   - Genre (optionnel, pour segmenter campagnes)
 *
 * Au succès :
 *   - Confetti palette Rialto (#C73E1D, #E6A12C, #F9F1E4)
 *   - Toast "C'est tout bon ! 🎂"
 *   - Reload page pour rafraîchir l'affichage
 */

import { useState } from "react";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type Props = {
  open: boolean;
  cardId: string;
  firstName: string;
  onClose: () => void;
  onSuccess: () => void;
};

type Gender = "H" | "F" | "Autre" | "Non precise";

export default function ActivationModal({
  open,
  cardId,
  firstName,
  onClose,
  onSuccess,
}: Props) {
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState<Gender>("Non precise");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!dob) {
      setError("Merci d'indiquer ta date de naissance.");
      return;
    }

    // Age check ≥ 18 côté client (Phase 11 C1 rule)
    const dobDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - dobDate.getFullYear();
    const monthDiff = today.getMonth() - dobDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < dobDate.getDate())
    ) {
      age--;
    }
    if (age < 18) {
      setError("Tu dois avoir 18 ans ou plus pour activer la carte.");
      return;
    }
    if (age > 120) {
      setError("Date de naissance invalide.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/customer-cards/${cardId}/activate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ date_of_birth: dob, gender }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          (body && (body.error as string)) ?? `HTTP ${res.status}`,
        );
      }

      // Confetti palette Rialto
      try {
        const confettiMod = await import("canvas-confetti");
        const confetti = confettiMod.default;
        confetti({
          particleCount: 120,
          spread: 75,
          origin: { y: 0.6 },
          colors: ["#C73E1D", "#E6A12C", "#F9F1E4"],
        });
      } catch (confErr) {
        console.warn("[activation] confetti failed", confErr);
      }

      onSuccess();
    } catch (err) {
      console.error("[activation] failed", err);
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-t-3xl bg-cream shadow-pop md:rounded-3xl">
        {/* Header avec visuel terracotta */}
        <div className="bg-gradient-to-br from-rialto to-rialto-dark p-6 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-saffron">
                Étape 2/2
              </div>
              <h2 className="mt-1 font-display text-2xl font-bold leading-tight">
                Complète ta carte, {firstName || "ami"} 🎂
              </h2>
              <p className="mt-2 text-sm text-white/90">
                On t&apos;envoie un cadeau le jour de ton anniversaire —{" "}
                <strong>-20% sur ta prochaine commande</strong> ou un dessert
                offert si tu es VIP.
              </p>
            </div>
            {!submitting && (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 text-white/60 hover:text-white"
                aria-label="Fermer"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5 p-6">
          {/* Date anniversaire */}
          <div>
            <label
              htmlFor="dob"
              className="block text-xs font-semibold uppercase tracking-wider text-ink/70"
            >
              Date de naissance
            </label>
            <input
              id="dob"
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
              max={new Date().toISOString().slice(0, 10)}
              className="mt-2 w-full rounded-xl border-2 border-border bg-white px-4 py-3 text-base text-ink focus:border-rialto focus:outline-none"
              disabled={submitting}
            />
            <p className="mt-1.5 text-[11px] text-mute">
              On ne partage jamais ta date, juste pour le cadeau 🎁
            </p>
          </div>

          {/* Genre */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70">
              Genre <span className="font-normal normal-case text-mute">(facultatif)</span>
            </label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {(["H", "F", "Autre", "Non precise"] as Gender[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGender(g)}
                  disabled={submitting}
                  className={`rounded-xl border-2 px-2 py-2.5 text-xs font-semibold transition ${
                    gender === g
                      ? "border-rialto bg-rialto/10 text-rialto"
                      : "border-border bg-white text-ink/70 hover:border-ink/30"
                  }`}
                >
                  {g === "Non precise" ? "—" : g}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-xl border-2 border-rialto bg-rialto/10 p-3 text-xs text-rialto">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full justify-center"
          >
            {submitting ? "Enregistrement…" : "Activer ma carte 🎉"}
          </button>

          <p className="text-center text-[10px] text-mute">
            En activant, tu acceptes de recevoir un SMS le jour de ton
            anniversaire (désinscription à tout moment).
          </p>
        </form>
      </div>
    </div>
  );
}
