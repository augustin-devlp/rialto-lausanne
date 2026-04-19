"use client";

import { useEffect, useState } from "react";
import { sanitizePhoneCH } from "@/lib/format";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";

type StampifyCard = {
  id: string;
  current_stamps: number;
  stamps_required: number;
  reward_description: string;
  card_name: string;
  qr_code_value: string;
  rewards_claimed: number;
};

type StampifyCustomer = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  email: string | null;
};

type Props = {
  restaurantId: string;
  stampifyBaseUrl?: string;
  defaultFirstName: string;
  defaultLastName: string;
  phone: string;
};

/**
 * Carte fidélité Rialto affichée sur /order/[id].
 * Utilise le système Stampify natif (customers + customer_cards).
 * Visible dès l'arrivée sur la page, quel que soit le statut de la commande.
 */
export default function LoyaltyCardSignup({
  defaultFirstName,
  defaultLastName,
  phone: initialPhone,
}: Props) {
  const [customer, setCustomer] = useState<StampifyCustomer | null>(null);
  const [card, setCard] = useState<StampifyCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [phone, setPhone] = useState(initialPhone);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lookup initial par téléphone
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${STAMPIFY_BASE}/api/rialto/loyalty/lookup?phone=${encodeURIComponent(
            initialPhone,
          )}`,
        );
        if (res.ok) {
          const body = (await res.json()) as {
            customer: StampifyCustomer | null;
            card: StampifyCard | null;
          };
          if (!cancelled && body.customer && body.card) {
            setCustomer(body.customer);
            setCard(body.card);
          }
        }
      } catch (err) {
        console.error("[loyalty] lookup failed", err);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialPhone]);

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
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/loyalty/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(
          (body as { error?: string }).error ??
            `Erreur serveur (${res.status}). Réessayez ou appelez Rialto.`,
        );
        return;
      }
      const body = (await res.json()) as {
        customer: StampifyCustomer;
        card: StampifyCard;
      };
      setCustomer(body.customer);
      setCard(body.card);
    } catch (err) {
      console.error("[loyalty] submit failed", err);
      setError(
        err instanceof Error
          ? `Erreur réseau : ${err.message}`
          : "Erreur réseau inconnue.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 text-center text-sm text-mute">
        Chargement de votre carte fidélité…
      </section>
    );
  }

  if (customer && card) {
    return <ActiveCard customer={customer} card={card} />;
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
            Chaque commande = 1 tampon. À 10 tampons, recevez un plat de votre
            choix offert.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Prénom"
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <input
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Nom"
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
        </div>
        <input
          required
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+41 79 123 45 67"
          className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
        />

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800">
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

function ActiveCard({
  customer,
  card,
}: {
  customer: StampifyCustomer;
  card: StampifyCard;
}) {
  const complete = card.current_stamps >= card.stamps_required;
  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-start gap-3">
        <div className="text-3xl">🎁</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-emerald-900">
            Bonjour {customer.first_name} !
          </h3>
          <p className="mt-1 text-sm text-emerald-900/80">
            Carte <strong>{card.card_name}</strong> · {card.reward_description}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-emerald-900">
            {card.current_stamps} / {card.stamps_required} tampons
          </span>
          {complete && (
            <span className="text-xs font-bold text-emerald-700">
              🏆 Récompense disponible
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: card.stamps_required }).map((_, i) => (
            <div
              key={i}
              className={`h-8 flex-1 rounded-md transition-colors ${
                i < card.current_stamps
                  ? "bg-emerald-600"
                  : "bg-white border border-emerald-200"
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-emerald-900/70">
          Votre prochaine commande créditera 1 tampon à la validation en caisse.
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
