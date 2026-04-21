"use client";

import { useEffect, useState } from "react";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type VerifyResult =
  | { ok: true; reason: "existing-claim" | "new-claim" }
  | {
      ok: false;
      reason:
        | "no-recent-review"
        | "already-claimed"
        | "api-missing"
        | "place-id-missing"
        | "google-api-error";
      user_message?: string;
      freshest_age_minutes?: number | null;
    };

type Props = {
  customerId: string;
  placeId: string;
  /** Libellé contextuel pour le titre du modal. */
  purpose: "spin" | "lottery";
  onClose: () => void;
  /** Appelé quand le claim est validé (existing OU new). */
  onVerified: () => void;
};

const WAIT_BEFORE_CHECK_MS = 30_000;

/**
 * Modal qui demande un avis Google 5★ pour débloquer roue + loterie.
 * 1. Bouton "Laisser un avis Google" → ouvre Google dans un nouvel onglet.
 * 2. Après 30s, active "J'ai laissé mon avis, vérifier".
 * 3. Appelle /api/rialto/loyalty/verify-review → si OK, onVerified().
 */
export default function ReviewGateModal({
  customerId,
  placeId,
  purpose,
  onClose,
  onVerified,
}: Props) {
  const [startedReviewAt, setStartedReviewAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState<number>(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviewUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

  // Timer de cooldown 30s
  useEffect(() => {
    if (startedReviewAt === null) {
      setRemainingSec(0);
      return;
    }
    const update = () => {
      const elapsed = Date.now() - startedReviewAt;
      const remain = Math.max(
        0,
        Math.ceil((WAIT_BEFORE_CHECK_MS - elapsed) / 1000),
      );
      setRemainingSec(remain);
    };
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, [startedReviewAt]);

  const canVerify = startedReviewAt !== null && remainingSec === 0;

  async function handleVerify() {
    if (!canVerify || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/loyalty/verify-review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_id: customerId }),
        },
      );
      if (!res.ok) {
        setError(`Erreur serveur (${res.status}). Réessayez.`);
        return;
      }
      const body = (await res.json()) as VerifyResult;
      if (body.ok) {
        onVerified();
        return;
      }
      // Le backend renvoie désormais un user_message contextualisé. On
      // l'utilise en priorité et on tombe sur les messages par défaut sinon.
      if (body.user_message) {
        setError(body.user_message);
        if (body.reason === "no-recent-review") {
          // Relance un cooldown court pour laisser Google propager
          setStartedReviewAt(Date.now() - (WAIT_BEFORE_CHECK_MS - 20_000));
        }
      } else {
        switch (body.reason) {
          case "no-recent-review":
            setError(
              "Nous n'avons pas encore détecté votre avis. Si vous venez de le publier, patientez 1 min puis réessayez.",
            );
            setStartedReviewAt(Date.now() - (WAIT_BEFORE_CHECK_MS - 20_000));
            break;
          case "already-claimed":
            setError(
              "Cet avis a déjà été utilisé. Laissez-en un nouveau pour débloquer.",
            );
            break;
          case "api-missing":
            setError(
              "La vérification automatique est désactivée. Contactez le restaurant.",
            );
            break;
          case "place-id-missing":
            setError("Configuration Google manquante. Contactez le support.");
            break;
          case "google-api-error":
            setError("Erreur temporaire Google. Réessayez dans 1 min.");
            break;
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? `Erreur réseau : ${err.message}` : "Erreur réseau",
      );
    } finally {
      setVerifying(false);
    }
  }

  function openReview() {
    window.open(reviewUrl, "_blank", "noopener,noreferrer");
    setStartedReviewAt(Date.now());
    setError(null);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
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
          aria-label="Fermer"
        >
          ✕
        </button>

        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 text-3xl">
            ⭐
          </div>
          <h3 className="mt-3 text-lg font-black tracking-tight">
            Un avis Google = Roue + Loterie débloquées
          </h3>
          <p className="mt-2 text-sm text-mute">
            Laissez un avis 5 étoiles sur Google pour débloquer{" "}
            <strong>la roue ET la loterie</strong> pour cette période.
            <br />
            <span className="text-[11px] text-gray-500">
              Un seul avis suffit pour les deux !
            </span>
          </p>
        </div>

        <div className="mt-5 space-y-2">
          <button
            type="button"
            onClick={openReview}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white shadow transition hover:bg-rialto-dark"
          >
            <span className="text-base">⭐</span>
            Laisser un avis Google
          </button>

          <button
            type="button"
            onClick={handleVerify}
            disabled={!canVerify || verifying}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
              canVerify && !verifying
                ? "bg-gray-900 text-white hover:bg-black"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {verifying
              ? "Vérification…"
              : remainingSec > 0
                ? `Vérifier (${remainingSec}s)`
                : startedReviewAt
                  ? "J'ai laissé mon avis, vérifier"
                  : "J'ai laissé mon avis, vérifier"}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            {error}
          </div>
        )}

        <p className="mt-4 text-center text-[10px] text-gray-400">
          Votre avis est vérifié automatiquement. {purpose === "spin" ? "La roue" : "La loterie"}{" "}
          se débloque immédiatement.
        </p>
      </div>
    </div>
  );
}
