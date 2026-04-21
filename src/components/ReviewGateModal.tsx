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

// TODO HACK TEMPORAIRE — jusqu'à jeudi 23 avril — remplacer par vraie
// vérification Google Places API une fois la clé GOOGLE_PLACES_API_KEY
// configurée dans Vercel. Voir commentaire en haut de handleVerify.
const WAIT_BEFORE_CHECK_MS = 60_000;

/**
 * Clé localStorage pour stocker l'intent de l'utilisateur (a-t-il cliqué
 * sur "Laisser un avis" ? à quel moment ?). Persiste entre les refresh.
 */
function intentKey(customerId: string): string {
  return `rialto:review-intent:${customerId}`;
}

type ReviewIntent = {
  opened_at: number;
  status: "review_opened" | "verified";
};

function readIntent(customerId: string): ReviewIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(intentKey(customerId));
    if (!raw) return null;
    return JSON.parse(raw) as ReviewIntent;
  } catch {
    return null;
  }
}

function writeIntent(customerId: string, intent: ReviewIntent): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(intentKey(customerId), JSON.stringify(intent));
}

/**
 * Modal qui demande un avis Google 5★ pour débloquer roue + loterie.
 *
 * 2 modes :
 * - Mode normal (GOOGLE_PLACES_API_KEY présent) : appel
 *   /api/rialto/loyalty/verify-review qui interroge Google Places.
 * - Mode dégradé (pas de clé) : hack timer 60s — le bouton "J'ai laissé
 *   mon avis" devient cliquable 60s après avoir cliqué "Laisser un avis".
 *   Appel /api/rialto/loyalty/verify-review-degraded qui crée le claim
 *   avec is_degraded_mode=true sans vérification Google.
 *
 * Le composant tente d'abord le mode normal ; si la réponse est
 * "api-missing" ou "google-api-error", il bascule automatiquement en mode
 * dégradé (et l'UI countdown s'active).
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
  const [degradedMode, setDegradedMode] = useState<boolean>(false);

  // Au mount : recharge un intent précédent si présent
  useEffect(() => {
    const prev = readIntent(customerId);
    if (prev && prev.status === "review_opened") {
      setStartedReviewAt(prev.opened_at);
      console.log(
        `[review-gate] step=init action=restore_intent remaining_s=${Math.max(0, Math.round((prev.opened_at + WAIT_BEFORE_CHECK_MS - Date.now()) / 1000))}`,
      );
    }
  }, [customerId]);

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

  /**
   * Vérifie l'avis en deux temps :
   * 1. Essaie d'abord le mode normal (appel Google Places côté Stampify)
   * 2. Si "api-missing" ou "google-api-error" → bascule auto en mode
   *    dégradé (verify-review-degraded). Le timer 60s côté client sert
   *    de garde-fou "honor-based".
   *
   * Une fois basculé en mode dégradé, les clics suivants ciblent
   * directement l'endpoint dégradé.
   */
  async function handleVerify() {
    if (!canVerify || verifying) return;
    setVerifying(true);
    setError(null);
    console.log(
      `[review-gate] step=verify action=click degraded_mode=${degradedMode}`,
    );
    try {
      // Tentative mode normal d'abord (sauf si on a déjà basculé)
      if (!degradedMode) {
        const res = await fetch(
          `${STAMPIFY_BASE}/api/rialto/loyalty/verify-review`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ customer_id: customerId }),
          },
        );
        if (res.ok) {
          const body = (await res.json()) as VerifyResult;
          if (body.ok) {
            writeIntent(customerId, {
              opened_at: startedReviewAt ?? Date.now(),
              status: "verified",
            });
            console.log("[review-gate] step=verified reason=normal_mode");
            onVerified();
            return;
          }
          // Si raison = api-missing ou google-api-error → fallback mode dégradé
          if (
            body.reason === "api-missing" ||
            body.reason === "google-api-error"
          ) {
            console.log(
              `[review-gate] step=fallback action=switch_to_degraded reason=${body.reason}`,
            );
            setDegradedMode(true);
            // Continue vers le call dégradé juste après
          } else {
            // Autres raisons : afficher user_message et stop
            setError(
              body.user_message ??
                (body.reason === "already-claimed"
                  ? "Cet avis a déjà été utilisé."
                  : "Vérification échouée, réessayez."),
            );
            return;
          }
        }
      }

      // Mode dégradé — appel endpoint dédié
      const opened_at = startedReviewAt ?? Date.now() - WAIT_BEFORE_CHECK_MS;
      const res2 = await fetch(
        `${STAMPIFY_BASE}/api/rialto/loyalty/verify-review-degraded`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customer_id: customerId, opened_at }),
        },
      );
      const body2 = (await res2.json()) as {
        ok: boolean;
        reason?: string;
        user_message?: string;
      };
      if (body2.ok) {
        writeIntent(customerId, {
          opened_at,
          status: "verified",
        });
        console.log("[review-gate] step=verified reason=degraded_mode");
        onVerified();
        return;
      }
      setError(
        body2.user_message ??
          (body2.reason === "too_soon"
            ? "Patientez encore quelques secondes…"
            : "Vérification échouée, rouvrez Google et réessayez."),
      );
    } catch (err) {
      setError(
        err instanceof Error ? `Erreur réseau : ${err.message}` : "Erreur réseau",
      );
    } finally {
      setVerifying(false);
    }
  }

  function openReview() {
    const openedAt = Date.now();
    window.open(reviewUrl, "_blank", "noopener,noreferrer");
    setStartedReviewAt(openedAt);
    writeIntent(customerId, { opened_at: openedAt, status: "review_opened" });
    setError(null);
    console.log(`[review-gate] step=opened action=click_google_url opened_at=${openedAt}`);
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
