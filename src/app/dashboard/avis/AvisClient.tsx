"use client";

/**
 * Écran Avis Google — file de validation du gate avis roue (RV1b).
 *
 * « À valider » = les clients qui ont cliqué « mon avis n'apparaît pas »
 * (manual_pending). Le bouton Valider crée le claim → la roue se
 * débloque. Grisé si le client détient déjà un claim valide (l'API
 * renverrait 409). Les pending (vérification API en cours) et l'historique
 * sont listés pour contexte, sans action.
 *
 * Visible uniquement en mode api/mock — en mode déclaratif la route
 * répond 503 rv1_non_executee ou la table est vide, l'écran l'explique.
 */

import { useCallback, useEffect, useState } from "react";

type RequeteRow = {
  id: string;
  customer_id: string;
  google_name: string;
  status: string;
  created_at: string;
  last_checked_at: string | null;
  check_count: number;
  claim_actif: boolean;
  customers: { first_name: string | null; phone: string | null } | null;
};

const STATUT_LABEL: Record<string, string> = {
  pending: "Vérification en cours",
  manual_pending: "À valider",
  verified: "Vérifié (API)",
  manual_approved: "Validé à la main",
  expired: "Expirée",
  rejected: "Refusée",
};

function statutChip(s: string): string {
  switch (s) {
    case "manual_pending":
      return "bg-saffron/20 text-ink/80";
    case "pending":
      return "bg-ink/10 text-ink/60";
    case "verified":
    case "manual_approved":
      return "bg-emerald-50 text-emerald-700";
    default:
      return "bg-ink/10 text-ink/50";
  }
}

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-CH", {
    timeZone: "Europe/Zurich",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AvisClient() {
  const [rows, setRows] = useState<RequeteRow[] | null>(null);
  const [error, setError] = useState<"reseau" | "inactif" | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const recharge = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/reviews", {
        cache: "no-store",
      });
      if (res.status === 503) {
        setError("inactif");
        return;
      }
      if (!res.ok) {
        setError("reseau");
        return;
      }
      const body = (await res.json()) as {
        ok: boolean;
        requests: RequeteRow[];
      };
      if (body.ok) {
        setRows(body.requests);
        setError(null);
      }
    } catch {
      setError("reseau");
    }
  }, []);

  useEffect(() => {
    void recharge();
  }, [recharge]);

  async function valide(id: string) {
    if (enCours) return;
    setEnCours(id);
    setMessage(null);
    try {
      const res = await fetch("/api/dashboard/reviews/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request_id: id }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (res.ok && body?.ok) {
        setMessage("✅ Validé — la roue du client est débloquée.");
      } else if (body?.error === "claim_deja_actif") {
        setMessage("Ce client a déjà un tour de roue actif — rien à faire.");
      } else if (body?.error === "deja_traitee") {
        setMessage("Cette demande a déjà été traitée.");
      } else if (body?.error === "claim_cree_maj_ko") {
        // Re-cliquer échouerait en 409 claim_deja_actif : ne pas y inviter.
        setMessage(
          "Le tour a bien été débloqué, mais la demande n'a pas pu être classée. Signalez-le à Servato.",
        );
      } else {
        setMessage("⚠️ Validation impossible. Réessayez.");
      }
      await recharge();
    } catch {
      setMessage("⚠️ Problème de connexion. Réessayez.");
    } finally {
      setEnCours(null);
    }
  }

  if (error === "inactif") {
    return (
      <div className="space-y-4 pb-6">
        <h1 className="font-display text-2xl font-bold text-ink">
          Avis Google
        </h1>
        <div className="rounded-2xl border border-border bg-white p-5 text-sm text-ink/70">
          La vérification automatique des avis n&apos;est pas encore
          activée. Cet écran s&apos;ouvrira quand elle le sera — rien à
          faire d&apos;ici là.
        </div>
      </div>
    );
  }
  if (error === "reseau") {
    return (
      <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-4 text-sm font-medium text-rialto">
        Impossible de charger les avis. Rechargez la page.
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
      </div>
    );
  }

  const aValider = rows.filter((r) => r.status === "manual_pending");
  const autres = rows.filter((r) => r.status !== "manual_pending");

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">
        Avis Google
      </h1>
      <p className="text-xs leading-snug text-mute">
        Un client qui laisse un avis débloque une chance à la roue. Quand
        la vérification automatique ne trouve pas l&apos;avis, la demande
        arrive ici : vérifiez sur votre fiche Google que l&apos;avis
        existe, puis validez.
      </p>

      {message && (
        <div className="rounded-2xl border border-border bg-white p-3 text-sm text-ink/80">
          {message}
        </div>
      )}

      {/* File à valider */}
      <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
          À valider ({aValider.length})
        </h2>
        {aValider.length === 0 ? (
          <p className="py-2 text-sm text-mute">
            Aucune demande en attente. 👌
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {aValider.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-display text-sm font-bold text-ink">
                      {r.google_name}
                    </div>
                    <div className="mt-0.5 text-xs text-mute">
                      {r.customers?.first_name ?? "Client"}
                      {r.customers?.phone && ` · ${r.customers.phone}`}
                      {` · demandé le ${dateCourte(r.created_at)}`}
                    </div>
                    {r.claim_actif && (
                      <div className="mt-0.5 text-[11px] font-medium text-saffron-dark">
                        A déjà un tour de roue actif
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => void valide(r.id)}
                    disabled={enCours !== null || r.claim_actif}
                    className="btn-primary flex-shrink-0 text-sm disabled:opacity-40"
                  >
                    {enCours === r.id ? "…" : "Valider"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Historique / suivi */}
      {autres.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-card">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-mute">
            Suivi et historique
          </h2>
          <ul className="divide-y divide-border">
            {autres.map((r) => (
              <li key={r.id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-display text-sm font-bold text-ink">
                    {r.google_name}
                  </span>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${statutChip(r.status)}`}
                  >
                    {STATUT_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-mute">
                  {r.customers?.first_name ?? "Client"}
                  {r.customers?.phone && ` · ${r.customers.phone}`}
                  {` · ${dateCourte(r.created_at)}`}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
