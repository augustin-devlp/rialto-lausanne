"use client";

/**
 * Écran Parrainage — réconciliation (D4).
 * Funnel + détail : les 2 codes -100% de chaque parrainage récompensé
 * (parrain / filleul) avec statut, et le statut RÉEL des SMS.
 */

import { useEffect, useState } from "react";

type PromoInfo = {
  code: string;
  statut: "utilise" | "actif" | "expire" | "non_emis";
  utilise_le: string | null;
  commande: string | null;
};

type SmsInfo = {
  statut: "sent" | "failed" | "aucun";
  envoye_le: string | null;
  erreur: string | null;
};

type ParrainageState = {
  funnel: {
    codes_emis: number;
    filleuls_en_attente: number;
    parrainages_recompenses: number;
  };
  detail: Array<{
    id: string;
    parrain: string;
    filleul_phone_masked: string | null;
    recompense_le: string | null;
    code_parrain: PromoInfo;
    code_filleul: PromoInfo;
    sms_parrain: SmsInfo;
    sms_filleul: SmsInfo;
  }>;
};

const PROMO_LABEL: Record<PromoInfo["statut"], string> = {
  utilise: "Utilisé",
  actif: "Actif",
  expire: "Expiré",
  non_emis: "Non émis",
};

function promoChip(s: PromoInfo["statut"]): string {
  switch (s) {
    case "utilise":
      return "bg-emerald-50 text-emerald-700";
    case "actif":
      return "bg-saffron/20 text-ink/80";
    case "expire":
      return "bg-ink/10 text-ink/50";
    case "non_emis":
      return "bg-rialto/10 text-rialto";
  }
}

function SmsBadge({ sms }: { sms: SmsInfo }) {
  if (sms.statut === "aucun")
    return <span className="text-[11px] text-mute">SMS : aucun</span>;
  if (sms.statut === "sent")
    return (
      <span className="text-[11px] font-medium text-emerald-700">
        SMS envoyé ✓
      </span>
    );
  return (
    <span
      className="text-[11px] font-medium text-rialto"
      title={sms.erreur ?? undefined}
    >
      SMS échoué ✗
    </span>
  );
}

export default function ParrainageAdminClient() {
  const [state, setState] = useState<ParrainageState | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dashboard/parrainage", {
          cache: "no-store",
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(true);
          return;
        }
        const body = (await res.json()) as { ok: boolean } & ParrainageState;
        if (body.ok) setState(body);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-rialto/30 bg-rialto/10 p-4 text-sm font-medium text-rialto">
        Impossible de charger le parrainage. Rechargez la page.
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">Parrainage</h1>

      {/* Funnel */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-border bg-white p-3 text-center">
          <div className="font-display text-2xl font-bold text-ink">
            {state.funnel.codes_emis}
          </div>
          <div className="text-[10px] leading-tight text-mute">
            Codes parrain actifs
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3 text-center">
          <div className="font-display text-2xl font-bold text-saffron-dark">
            {state.funnel.filleuls_en_attente}
          </div>
          <div className="text-[10px] leading-tight text-mute">
            Filleuls en attente de 1re commande
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-white p-3 text-center">
          <div className="font-display text-2xl font-bold text-emerald-700">
            {state.funnel.parrainages_recompenses}
          </div>
          <div className="text-[10px] leading-tight text-mute">
            Parrainages récompensés
          </div>
        </div>
      </div>

      {/* Détail */}
      {state.detail.length === 0 ? (
        <div className="rounded-2xl border border-border bg-white p-6 text-center text-sm text-mute">
          Aucun parrainage récompensé pour l&apos;instant. Dès qu&apos;un
          filleul passe sa première commande, les deux codes −100 %
          apparaissent ici avec leur suivi.
        </div>
      ) : (
        <div className="space-y-3">
          {state.detail.map((d) => (
            <div
              key={d.id}
              className="rounded-2xl border border-border bg-white p-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-semibold text-ink">
                  {d.parrain}
                  {d.filleul_phone_masked && (
                    <span className="font-normal text-mute">
                      {" "}
                      → {d.filleul_phone_masked}
                    </span>
                  )}
                </span>
                {d.recompense_le && (
                  <span className="flex-shrink-0 text-[11px] text-mute">
                    {new Date(d.recompense_le).toLocaleDateString("fr-CH", {
                      timeZone: "Europe/Zurich",
                      day: "2-digit",
                      month: "2-digit",
                    })}
                  </span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(
                  [
                    ["Parrain", d.code_parrain, d.sms_parrain],
                    ["Filleul", d.code_filleul, d.sms_filleul],
                  ] as const
                ).map(([label, promo, sms]) => (
                  <div
                    key={label}
                    className="rounded-xl bg-cream p-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
                        {label}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${promoChip(promo.statut)}`}
                      >
                        {PROMO_LABEL[promo.statut]}
                      </span>
                    </div>
                    <div className="mt-1 font-display text-sm font-bold tracking-wide text-ink">
                      {promo.code}
                    </div>
                    {promo.statut === "utilise" && promo.commande && (
                      <div className="text-[11px] text-mute">
                        Commande {promo.commande}
                      </div>
                    )}
                    <div className="mt-1">
                      <SmsBadge sms={sms} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-snug text-mute">
        Statut SMS = journal réel des envois (un échec s&apos;affiche
        échoué, pas « envoyé »). Les parrainages récompensés avant la
        migration D4a retrouvent leur code filleul par convention de
        nommage.
      </p>
    </div>
  );
}
