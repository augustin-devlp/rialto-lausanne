"use client";

/**
 * Gate avis roue — flux VÉRIFICATION RÉELLE (mode 'api'/'mock', 14.08.2026).
 *
 * Remplace le flux déclaratif (ReviewGateModal) quand
 * NEXT_PUBLIC_REVIEW_GATE_MODE = api|mock :
 *   1. « Partagez votre expérience » → lien direct vers le formulaire
 *      d'avis de la fiche Google ;
 *   2. le client saisit SON nom Google → POST review-request ;
 *   3. pending → « en cours de publication », re-checks automatiques
 *      (interval + retour au premier plan — le serveur throttle à 2 min) ;
 *   4. match → roue débloquée (claim créé côté serveur) ;
 *   5. « Mon avis n'apparaît pas » → validation manuelle au dashboard.
 *
 * ⚠️ GARDE-FOUS (décision Augustin) : on demande UN avis — JAMAIS « un
 * avis positif » ni « 5 étoiles » — et la roue est une « chance de
 * gagner », jamais un gain garanti. Toute retouche de copie ici doit
 * respecter ces deux règles.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const RECHECK_UI_MS = 90_000;

type RequestState = {
  id: string;
  status: string;
  google_name: string;
  check_count: number;
} | null;

type Props = {
  customerId: string;
  placeId: string;
  onVerified: () => void;
};

export default function ReviewGateApi({ customerId, placeId, onVerified }: Props) {
  const [request, setRequest] = useState<RequestState>(null);
  const [nom, setNom] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const verifiedNotifie = useRef(false);

  const writeReviewUrl = `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;

  const applique = useCallback(
    (req: RequestState) => {
      setRequest(req);
      if (req?.status === "verified" && !verifiedNotifie.current) {
        verifiedNotifie.current = true;
        onVerified();
      }
    },
    [onVerified],
  );

  const recharge = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/rialto/loyalty/review-request?customer_id=${encodeURIComponent(customerId)}`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as { ok: boolean; request: RequestState };
      if (body.ok) applique(body.request);
    } catch {
      /* re-check suivant */
    }
  }, [customerId, applique]);

  // Statut au montage + re-checks tant que la vérification est en cours.
  useEffect(() => {
    void recharge();
  }, [recharge]);
  useEffect(() => {
    if (request?.status !== "pending") return;
    const id = window.setInterval(() => void recharge(), RECHECK_UI_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void recharge();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [request?.status, recharge]);

  async function declare() {
    const n = nom.trim();
    if (n.length < 2 || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const res = await fetch("/api/rialto/loyalty/review-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, google_name: n }),
      });
      const body = (await res.json()) as { ok: boolean; request: RequestState };
      if (res.ok && body.ok) applique(body.request);
      else setErreur("Vérification indisponible. Réessayez dans un instant.");
    } catch {
      setErreur("Problème de connexion. Réessayez.");
    } finally {
      setEnvoi(false);
    }
  }

  async function signaleManuel() {
    if (envoi) return;
    setEnvoi(true);
    try {
      const res = await fetch("/api/rialto/loyalty/review-request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ customer_id: customerId, flag_manual: true }),
      });
      const body = (await res.json()) as { ok: boolean; request: RequestState };
      if (res.ok && body.ok) applique(body.request);
    } catch {
      /* réessayable */
    } finally {
      setEnvoi(false);
    }
  }

  /* ─── Vérifié : le parent recharge la disponibilité de la roue ─── */
  if (request?.status === "verified" || request?.status === "manual_approved") {
    return (
      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        ✅ Merci pour votre avis ! La roue se débloque…
      </div>
    );
  }

  /* ─── Transmis au restaurant ─── */
  if (request?.status === "manual_pending") {
    return (
      <div className="mt-6 rounded-2xl border border-saffron/50 bg-white p-4 text-sm text-ink/80">
        👀 Transmis au restaurant pour vérification — votre tour sera
        débloqué dès validation. Repassez un peu plus tard.
      </div>
    );
  }

  /* ─── En cours de publication ─── */
  if (request?.status === "pending") {
    return (
      <div className="mt-6 space-y-3 text-left">
        <div className="rounded-2xl border border-border bg-white p-4 text-sm text-ink/80">
          <p>
            ⏳ Nous cherchons l&apos;avis de{" "}
            <strong>{request.google_name}</strong> — Google peut mettre
            quelques minutes à le publier. Cette page se met à jour toute
            seule.
          </p>
          <p className="mt-2 text-xs text-mute">
            Pas encore posté ?{" "}
            <a
              href={writeReviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-rialto underline"
            >
              Écrire mon avis
            </a>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signaleManuel()}
          disabled={envoi}
          className="text-xs font-medium text-mute underline hover:text-ink"
        >
          Mon avis n&apos;apparaît pas
        </button>
      </div>
    );
  }

  /* ─── Départ : lien avis + déclaration du nom ─── */
  return (
    <div className="mt-6 space-y-4 text-left">
      <a
        href={writeReviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-primary-lg block text-center"
      >
        ⭐ Partager mon expérience sur Google
      </a>
      <div className="rounded-2xl border border-border bg-white p-4">
        <label className="mb-1 block text-sm font-semibold text-ink">
          Votre nom sur Google
        </label>
        <p className="mb-3 text-xs text-mute">
          Celui qui s&apos;affiche avec votre avis — pour le retrouver et
          débloquer votre chance de gagner.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Ex. Jean Dupont"
            className="min-w-0 flex-1 rounded-xl border-2 border-gray-200 px-3 py-2.5 text-base focus:border-[#C73E1D] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void declare()}
            disabled={envoi || nom.trim().length < 2}
            className="btn-primary flex-shrink-0 disabled:opacity-50"
          >
            {envoi ? "…" : "Vérifier"}
          </button>
        </div>
        {erreur && <p className="mt-2 text-xs text-rialto">⚠️ {erreur}</p>}
      </div>
    </div>
  );
}
