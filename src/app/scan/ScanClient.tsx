"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

// html5-qrcode est strictement client → import dynamique sans SSR.
const QrScanner = dynamic(() => import("./QrScanner"), { ssr: false });

type Phase =
  | "pin"
  // ⚠️ PHASE AJOUTÉE LE 22.08 : sans elle, une panne de CONFIGURATION
  // (SCAN_PIN ou SCAN_COOKIE_SECRET absents en production) s'affichait à
  // l'employé comme « PIN incorrect ». Il aurait ressaisi le code juste,
  // encore et encore, sur une porte qui ne pouvait pas s'ouvrir — et
  // au bout de 5 essais il se serait pris le rate-limit par-dessus.
  // Un message trompeur au comptoir coûte un service, pas une minute.
  | "non_configure"
  | "scanning"
  | "loading"
  | "scanned"
  | "processing"
  | "success"
  | "error";

interface ScannedCard {
  id: string;
  current_stamps: number;
  current_points: number;
  rewards_claimed: number;
  first_name: string;
  last_name: string;
  card_name: string;
  stamps_required: number;
  reward_description: string;
}

interface ActivePromo {
  multiplier: number;
  title: string | null;
}

interface CreditResult {
  ok: boolean;
  error?: string;
  stamps_added?: number;
  new_stamps?: number;
  stamps_required?: number;
  reward_earned?: boolean;
}

const NETWORK_ERROR = "Erreur serveur. Réessayez.";

export default function ScanClient() {
  // Démarre en "loading" le temps de savoir si une session existe déjà.
  const [phase, setPhase] = useState<Phase>("loading");
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);

  const [manualCode, setManualCode] = useState("");
  const [card, setCard] = useState<ScannedCard | null>(null);
  const [promo, setPromo] = useState<ActivePromo | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const [creditResult, setCreditResult] = useState<CreditResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Empêche un double lookup si caméra + saisie se déclenchent ensemble.
  const lookupBusy = useRef(false);

  /* ─── Session check au mount ─────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/scan/login", { method: "GET" });
        if (cancelled) return;
        if (res.ok) {
          setPhase("scanning");
          return;
        }
        // 🔴 ON LIT LE MARQUEUR, PAS LE CODE DE STATUT.
        // Cette ligne testait `res.status === 500`. Or un 500 a DEUX causes
        // contraires : la config manquante (aucun code ne marchera jamais)
        // et un plantage passager de la lambda (tout remarche à la seconde
        // suivante). Un signal à deux causes contraires n'est plus un
        // signal : il envoyait le comptoir sur un écran terminal pour un
        // hoquet d'une seconde.
        // Le serveur envoyait DÉJÀ le bon marqueur — `scan_not_configured`,
        // dans le corps de la réponse — et ce client le jetait.
        const corps = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (cancelled) return;
        setPhase(corps?.error === "scan_not_configured" ? "non_configure" : "pin");
      } catch {
        if (!cancelled) setPhase("pin");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ─── Login PIN ──────────────────────────────────────────────────── */
  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinSubmitting) return;
    setPinSubmitting(true);
    setPinError(null);
    try {
      const res = await fetch("/api/scan/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        setPin("");
        setPhase("scanning");
      } else if (res.status === 429) {
        setPinError("Trop de tentatives. Patientez une minute puis réessayez.");
      } else {
        // 🔴 MÊME LECTURE DU MARQUEUR QU'AU MOUNT, et c'est ICI que ça
        // comptait le plus : l'employé vient de taper son code. Un 500
        // passager le sortait DÉFINITIVEMENT de l'écran de saisie.
        const corps = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (corps?.error === "scan_not_configured") {
          // Panne de config : aucun code ne marchera, on sort de l'écran.
          setPhase("non_configure");
        } else if (res.status >= 500) {
          // Hoquet serveur : on RESTE sur l'écran, et surtout on ne dit pas
          // « code incorrect » à quelqu'un qui a tapé le bon code.
          setPinError("Problème de connexion. Réessayez.");
        } else {
          setPinError("Code incorrect. Il est sur la carte sous le comptoir.");
        }
      }
    } catch {
      setPinError(NETWORK_ERROR);
    } finally {
      setPinSubmitting(false);
    }
  };

  /* ─── Lookup carte (QR ou short_code) ────────────────────────────── */
  const lookup = useCallback(async (params: { qr?: string; short_code?: string }) => {
    if (lookupBusy.current) return;
    lookupBusy.current = true;
    setPhase("loading");
    setScanError(null);
    try {
      const qs = params.qr
        ? `qr=${encodeURIComponent(params.qr)}`
        : `short_code=${encodeURIComponent(params.short_code ?? "")}`;
      const res = await fetch(`/api/scan/card?${qs}`, { method: "GET" });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        // Message VERBATIM renvoyé par l'API (QR non reconnu / carte introuvable).
        setScanError(data?.error ?? NETWORK_ERROR);
        setPhase("scanning");
        return;
      }
      setCard(data.card as ScannedCard);
      setPromo((data.promo as ActivePromo | null) ?? null);
      setManualCode("");
      setPhase("scanned");
    } catch {
      setScanError(NETWORK_ERROR);
      setPhase("scanning");
    } finally {
      lookupBusy.current = false;
    }
  }, []);

  const handleScan = useCallback(
    (qrValue: string) => {
      void lookup({ qr: qrValue });
    },
    [lookup],
  );

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    const code = manualCode.trim().toUpperCase();
    if (code.length !== 8) return;
    void lookup({ short_code: code });
  };

  /* ─── Crédit d'1 tampon (RPC serveur atomique) ───────────────────── */
  const creditStamp = async () => {
    if (!card) return;
    setPhase("processing");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/scan/credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer_card_id: card.id }),
      });
      const data = (await res.json().catch(() => null)) as CreditResult | null;

      if (!res.ok || !data) {
        setErrorMessage(NETWORK_ERROR);
        setPhase("error");
        return;
      }
      if (!data.ok) {
        // Refus métier : message VERBATIM du RPC (limite/jour, récompense/semaine…).
        setErrorMessage(data.error ?? NETWORK_ERROR);
        setPhase("error");
        return;
      }
      setCreditResult(data);
      setPhase("success");
    } catch {
      setErrorMessage(NETWORK_ERROR);
      setPhase("error");
    }
  };

  /* ─── Reset (relance la caméra) ──────────────────────────────────── */
  const resetToScan = () => {
    setCard(null);
    setPromo(null);
    setCreditResult(null);
    setScanError(null);
    setErrorMessage(null);
    setManualCode("");
    setPhase("scanning");
  };

  /* ─── Rendu ──────────────────────────────────────────────────────── */
  return (
    <main className="min-h-screen bg-cream px-4 py-8 text-ink">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="text-center">
          <p className="font-serif text-h2 leading-none text-rialto">Rialto</p>
          <p className="mt-1 text-sm font-medium uppercase tracking-widest text-mute">
            Scan des tampons
          </p>
        </header>

        {phase === "loading" && !card && <LoadingCard label="Chargement…" />}

        {phase === "non_configure" && (
          <div className="rounded-2xl border border-rialto/30 bg-rialto/5 p-6 text-center">
            {/* ⚠️ AUCUN NOM DE VARIABLE D'ENVIRONNEMENT ICI. L'écran
                /scan est servi à tout le monde : il n'y a pas de middleware,
                la porte est plus loin. Message pour un employé au comptoir :
                dire quoi FAIRE, pas ce qui est cassé.
                (Le dashboard nommait ses variables manquantes à tout
                visiteur ; c'est retiré depuis le 22.08 — voir `PinGate`.) */}
            <h1 className="font-serif text-xl text-ink">Scanner indisponible</h1>
            <p className="mt-2 text-sm text-mute">
              Le scanner ne peut pas s&apos;ouvrir en ce moment. Ce n&apos;est
              pas votre code.
            </p>
            <p className="mt-2 text-sm text-mute">
              Prévenez Augustin. En attendant, notez les cartes sur papier :
              les tampons pourront être ajoutés plus tard.
            </p>
            {/* 🔴 CET ÉCRAN ÉTAIT UN CUL-DE-SAC (relecture adversariale
                du 22.08, seul finding qui a survécu à trois sceptiques).
                Rien n'en sortait : ni bouton, ni minuteur, ni re-contrôle.
                La seule issue était que quelqu'un pense à recharger la page,
                pendant un service. Ce bouton est la sortie. */}
            <button
              type="button"
              onClick={async () => {
                setPhase("loading");
                try {
                  const res = await fetch("/api/scan/login", { method: "GET" });
                  if (res.ok) {
                    setPhase("scanning");
                    return;
                  }
                  const c = (await res.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                  setPhase(
                    c?.error === "scan_not_configured" ? "non_configure" : "pin",
                  );
                } catch {
                  setPhase("non_configure");
                }
              }}
              className="mt-4 w-full rounded-xl bg-rialto py-3 font-semibold text-white transition-colors hover:bg-rialto-dark"
            >
              Réessayer
            </button>
          </div>
        )}

        {phase === "pin" && (
          <PinScreen
            pin={pin}
            setPin={setPin}
            onSubmit={submitPin}
            error={pinError}
            submitting={pinSubmitting}
          />
        )}

        {phase === "scanning" && (
          <ScanScreen
            onScan={handleScan}
            manualCode={manualCode}
            setManualCode={setManualCode}
            onSubmitManual={submitManual}
            error={scanError}
          />
        )}

        {phase === "loading" && card && <LoadingCard label="Récupération du client…" />}

        {(phase === "scanned" || phase === "processing") && card && (
          <CardScreen
            card={card}
            promo={promo}
            processing={phase === "processing"}
            onCredit={creditStamp}
            onCancel={resetToScan}
          />
        )}

        {phase === "success" && card && creditResult && (
          <SuccessScreen
            card={card}
            result={creditResult}
            onNext={resetToScan}
          />
        )}

        {phase === "error" && (
          <ErrorScreen message={errorMessage} onBack={resetToScan} />
        )}
      </div>
    </main>
  );
}

/* ════════════════════════════════════════════════════════════════════ */
/* Sous-composants                                                         */
/* ════════════════════════════════════════════════════════════════════ */

function LoadingCard({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-white py-20 shadow-card">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-rialto border-t-transparent" />
      <p className="text-sm text-mute">{label}</p>
    </div>
  );
}

function PinScreen({
  pin,
  setPin,
  onSubmit,
  error,
  submitting,
}: {
  pin: string;
  setPin: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string | null;
  submitting: boolean;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-border bg-white p-6 shadow-card"
    >
      <div>
        <h1 className="font-serif text-2xl text-ink">Accès comptoir</h1>
        <p className="mt-1 text-sm text-mute">
          Entrez le code pour ouvrir le scanner.
        </p>
        {/* 🔴 CETTE PHRASE EST LA CONDITION POSÉE PAR AUGUSTIN LE 22.08,
            pas une décoration. La session passe de 30 à 7 jours : les
            occasions de tomber sur cet écran sont MULTIPLIÉES PAR QUATRE.
            La caisse a identifié le pire blocage du produit — session
            tombée, écran muet, plus personne ne connaît le code. Un écran
            qui dit où trouver le code est ce qui rend le raccourcissement
            acceptable.
            ⚠️ SI LA CARTE PLASTIFIÉE DISPARAÎT OU CHANGE DE PLACE,
            CETTE PHRASE DOIT CHANGER LE MÊME JOUR. Un repère faux est pire
            que pas de repère : il fait chercher au mauvais endroit.
            Mots courants et phrase courte (règle R4). */}
        <p className="mt-3 rounded-xl bg-cream px-3 py-2 text-sm text-mute">
          Le code est sur la carte plastifiée, sous le comptoir — la même
          que pour la caisse.
        </p>
      </div>

      <div>
        <label htmlFor="scan-pin" className="mb-1.5 block text-sm font-medium text-ink">
          Code PIN
        </label>
        {/* 🔴 CET INPUT REFUSAIT LES LETTRES.
            Il faisait `replace(/\D/g, "")` avec `maxLength={6}` et
            `inputMode="numeric"` : un PIN de 8 caractères ALPHANUMÉRIQUES —
            décision d'Augustin du 22.08 — était PHYSIQUEMENT IMPOSSIBLE À
            SAISIR. Changer `SCAN_PIN` sans changer cette ligne aurait
            condamné le scanner du comptoir, sans aucun message d'erreur
            utile : l'employé aurait tapé le bon code, vu ses lettres
            disparaître sous ses doigts, et lu « PIN incorrect ».
            `maxLength` à 32 et non à 8 : la limite de saisie ne doit pas
            fuir la longueur du secret. */}
        <input
          id="scan-pin"
          type="password"
          inputMode="text"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={32}
          value={pin}
          onChange={(e) => setPin(e.target.value.slice(0, 32))}
          className="w-full rounded-xl border border-border bg-cream px-4 py-3.5 text-center text-2xl tracking-[0.25em] text-ink outline-none focus:border-rialto focus:ring-2 focus:ring-rialto/30"
          placeholder="••••••••"
          autoFocus
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-rialto/30 bg-rialto/5 px-4 py-2.5 text-sm text-rialto-dark"
        >
          {error}
        </p>
      )}

      {/* Seuil de saisie abaissé à 1 : il était à 4, hérité du PIN
          numérique. Le laisser à 4 n'apporte rien, et un seuil calé sur la
          longueur réelle du secret la ferait fuir. Le serveur tranche. */}
      <button
        type="submit"
        disabled={submitting || pin.length < 1}
        className="w-full rounded-xl bg-rialto py-3.5 font-semibold text-white transition-colors hover:bg-rialto-dark disabled:opacity-50"
      >
        {submitting ? "Vérification…" : "Valider"}
      </button>
    </form>
  );
}

function ScanScreen({
  onScan,
  manualCode,
  setManualCode,
  onSubmitManual,
  error,
}: {
  onScan: (v: string) => void;
  manualCode: string;
  setManualCode: (v: string) => void;
  onSubmitManual: (e: React.FormEvent) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-white p-5 shadow-card">
        <p className="font-semibold text-ink">Scanner le QR code client</p>
        <p className="mt-0.5 text-sm text-mute">
          Pointez la caméra vers le QR code affiché sur le téléphone du client.
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rialto/30 bg-rialto/5 px-4 py-3 text-sm text-rialto-dark"
          >
            {error}
          </p>
        )}

        <div className="mt-4">
          <QrScanner onScan={onScan} />
        </div>
      </div>

      {/* Repli saisie manuelle du short_code */}
      <form
        onSubmit={onSubmitManual}
        className="rounded-2xl border border-border bg-white p-5 shadow-card"
      >
        <label
          htmlFor="manual-code"
          className="mb-1.5 block text-sm font-medium text-ink"
        >
          Ou saisissez le code de la carte
        </label>
        <div className="flex gap-2">
          <input
            id="manual-code"
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={8}
            value={manualCode}
            onChange={(e) =>
              setManualCode(e.target.value.toUpperCase().replace(/\s/g, "").slice(0, 8))
            }
            className="w-full rounded-xl border border-border bg-cream px-4 py-3 text-center font-mono text-lg tracking-[0.25em] text-ink outline-none focus:border-rialto focus:ring-2 focus:ring-rialto/30"
            placeholder="XXXXXXXX"
          />
          <button
            type="submit"
            disabled={manualCode.trim().length !== 8}
            className="shrink-0 rounded-xl bg-ink px-5 py-3 font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-40"
          >
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

/** Rangée de pastilles remplies/vides (esprit ScanPage Stampify). */
function StampDots({ filled, total }: { filled: number; total: number }) {
  const safeTotal = Math.max(total, 1);
  const dots = Array.from({ length: safeTotal }, (_, i) => i < filled);
  return (
    <div className="flex flex-wrap gap-2" aria-hidden="true">
      {dots.map((on, i) => (
        <span
          key={i}
          className={
            on
              ? "h-6 w-6 rounded-full bg-rialto ring-2 ring-rialto/20"
              : "h-6 w-6 rounded-full border-2 border-dashed border-border bg-cream"
          }
        />
      ))}
    </div>
  );
}

function CardScreen({
  card,
  promo,
  processing,
  onCredit,
  onCancel,
}: {
  card: ScannedCard;
  promo: ActivePromo | null;
  processing: boolean;
  onCredit: () => void;
  onCancel: () => void;
}) {
  const stamps = Math.min(card.current_stamps, card.stamps_required);
  const fullName = `${card.first_name} ${card.last_name}`.trim();

  return (
    <div className="space-y-5">
      {/* Fiche client */}
      <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
        <div className="bg-rialto px-6 py-5 text-white">
          <p className="text-xs font-medium uppercase tracking-widest text-white/70">
            {card.card_name || "Rialto Club"}
          </p>
          <p className="mt-1 font-serif text-2xl leading-tight">{fullName || "Client"}</p>
        </div>

        <div className="px-6 py-5">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-mute">Tampons</span>
            <span className="font-semibold text-ink">
              {card.current_stamps} / {card.stamps_required}
            </span>
          </div>
          <StampDots filled={stamps} total={card.stamps_required} />

          <p className="mt-4 text-xs text-mute">
            🎁 Récompense : {card.reward_description}
          </p>
        </div>
      </div>

      {promo && (
        <div className="rounded-xl border border-saffron/40 bg-saffron/10 px-4 py-3 text-sm text-ink">
          Promo : <strong>{promo.title}</strong> — tampons x{promo.multiplier}
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-border bg-white p-5 shadow-card">
        <button
          onClick={onCredit}
          disabled={processing}
          className="w-full rounded-xl bg-rialto py-4 text-base font-semibold text-white transition-colors hover:bg-rialto-dark disabled:opacity-50"
        >
          {processing ? "Enregistrement…" : "Ajouter 1 tampon"}
        </button>

        <button
          onClick={onCancel}
          disabled={processing}
          className="w-full py-1.5 text-sm text-mute transition-colors hover:text-ink disabled:opacity-50"
        >
          Annuler / scanner un autre
        </button>
      </div>
    </div>
  );
}

function SuccessScreen({
  card,
  result,
  onNext,
}: {
  card: ScannedCard;
  result: CreditResult;
  onNext: () => void;
}) {
  const added = result.stamps_added ?? 1;
  const newStamps = result.new_stamps ?? card.current_stamps;
  const required = result.stamps_required ?? card.stamps_required;
  const rewardEarned = result.reward_earned === true;

  return (
    <div className="space-y-5">
      {rewardEarned && (
        <div className="rounded-2xl border-2 border-saffron bg-saffron/10 px-6 py-6 text-center">
          <div className="text-4xl">🎉</div>
          <p className="mt-2 font-serif text-xl text-rialto-dark">Récompense gagnée !</p>
          <p className="mt-1 text-sm text-ink">
            {card.first_name ? `${card.first_name} a obtenu : ` : ""}
            <strong>{card.reward_description}</strong>
          </p>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-border bg-white px-6 py-8 text-center shadow-card">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rialto text-3xl text-white">
          ✓
        </div>
        <div>
          <p className="font-serif text-2xl text-ink">
            +{added} tampon{added > 1 ? "s" : ""} ajouté{added > 1 ? "s" : ""}
          </p>
          <p className="mt-1 text-sm text-mute">
            Progression : {newStamps} / {required}
          </p>
        </div>

        <StampDots filled={Math.min(newStamps, required)} total={required} />

        <button
          onClick={onNext}
          className="mt-2 w-full rounded-xl bg-rialto py-3.5 font-semibold text-white transition-colors hover:bg-rialto-dark"
        >
          Scanner le client suivant
        </button>
      </div>
    </div>
  );
}

function ErrorScreen({
  message,
  onBack,
}: {
  message: string | null;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5 rounded-2xl border-2 border-rialto/30 bg-white px-6 py-8 text-center shadow-card">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rialto/10 text-3xl text-rialto">
        ✗
      </div>
      <div>
        <p className="font-serif text-xl text-rialto-dark">Action refusée</p>
        <p role="alert" className="mt-1 text-sm text-ink">
          {message ?? "Une erreur s'est produite."}
        </p>
      </div>
      <button
        onClick={onBack}
        className="w-full rounded-xl bg-rialto py-3.5 font-semibold text-white transition-colors hover:bg-rialto-dark"
      >
        Retour au scanner
      </button>
    </div>
  );
}
