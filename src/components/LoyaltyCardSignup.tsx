"use client";

import { useEffect, useState } from "react";
import { sanitizePhoneCH } from "@/lib/format";

type RialtoCustomer = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  stamps_count: number;
};

type Props = {
  restaurantId: string;
  stampifyBaseUrl: string;
  defaultFirstName: string;
  defaultLastName: string;
  phone: string;
};

const STAMPS_REQUIRED = 10;

/**
 * Carte fidélité Rialto affichée sur /order/[id].
 * Visible dès l'arrivée sur la page, quel que soit le statut de la commande.
 *
 * États :
 *   - lookup initial : pendant que le hook vérifie si le tel est déjà inscrit
 *   - form inscription (si pas encore de carte)
 *   - carte active avec progression 10 tampons (si déjà inscrit)
 */
export default function LoyaltyCardSignup({
  restaurantId,
  stampifyBaseUrl,
  defaultFirstName,
  defaultLastName,
  phone: initialPhone,
}: Props) {
  const [customer, setCustomer] = useState<RialtoCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [phone, setPhone] = useState(initialPhone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check si le client est déjà enregistré pour ce téléphone
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const url = `${stampifyBaseUrl}/api/rialto/customers/signup?restaurant_id=${encodeURIComponent(
          restaurantId,
        )}&phone=${encodeURIComponent(initialPhone)}`;
        const res = await fetch(url);
        if (res.ok) {
          const body = (await res.json()) as { customer: RialtoCustomer | null };
          if (!cancelled && body.customer) setCustomer(body.customer);
        }
      } catch (err) {
        console.error("[loyalty] lookup failed", err);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId, initialPhone, stampifyBaseUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const cleanPhone = sanitizePhoneCH(phone);
    if (!firstName.trim()) {
      setError("Prénom obligatoire.");
      return;
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      setError("Numéro de téléphone invalide (format +41…).");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${stampifyBaseUrl}/api/rialto/customers/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          phone: cleanPhone,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        setError(
          (body as { error?: string }).error ??
            `Erreur serveur (${res.status}). Réessayez ou appelez Rialto.`,
        );
        return;
      }

      const body = (await res.json()) as { customer: RialtoCustomer };
      setCustomer(body.customer);
    } catch (err) {
      console.error("[loyalty] submit failed", err);
      setError(
        err instanceof Error
          ? `Erreur réseau : ${err.message}`
          : "Erreur réseau inconnue. Vérifiez votre connexion.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    // petit placeholder pendant le lookup initial
    return (
      <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-mute">
        Chargement de votre carte fidélité…
      </section>
    );
  }

  if (customer) {
    return <ActiveCard customer={customer} />;
  }

  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-start gap-3">
        <div className="text-3xl">🎁</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-emerald-900">
            Gagnez votre prochaine commande
          </h3>
          <p className="mt-1 text-sm text-emerald-900/80">
            Chaque commande = 1 tampon. À {STAMPS_REQUIRED} tampons, recevez
            un plat de votre choix offert.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-emerald-900/80">
              Prénom *
            </label>
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Prénom"
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-emerald-900/80">
              Nom *
            </label>
            <input
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nom"
              className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-emerald-900/80">
            Téléphone *
          </label>
          <input
            required
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+41 79 123 45 67"
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Spinner />
              <span>Activation en cours…</span>
            </>
          ) : (
            "Activer ma carte fidélité"
          )}
        </button>
      </form>

      <p className="mt-3 text-center text-[11px] text-emerald-900/70">
        ✓ Informations modifiables à tout moment
      </p>
    </section>
  );
}

function ActiveCard({ customer }: { customer: RialtoCustomer }) {
  const complete = customer.stamps_count >= STAMPS_REQUIRED;
  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-start gap-3">
        <div className="text-3xl">🎁</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-emerald-900">
            Bonjour {customer.first_name} !
          </h3>
          <p className="mt-1 text-sm text-emerald-900/80">
            Votre carte fidélité Rialto est active.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-emerald-900">
            {customer.stamps_count} / {STAMPS_REQUIRED} tampons
          </span>
          {complete && (
            <span className="text-xs font-bold text-emerald-700">
              🏆 Récompense disponible
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: STAMPS_REQUIRED }).map((_, i) => (
            <div
              key={i}
              className={`h-8 flex-1 rounded-md transition-colors ${
                i < customer.stamps_count
                  ? "bg-emerald-600"
                  : "bg-white border border-emerald-200"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-emerald-900/70">
          Votre prochaine commande créditera 1 tampon à la validation en
          caisse.
        </p>
      </div>
    </section>
  );
}

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
