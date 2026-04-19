"use client";

import { useEffect, useState } from "react";

type RialtoCustomer = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  stamps_count: number;
};

type Props = {
  restaurantId: string;
  stampifyBaseUrl: string; // ex: https://stampify.ch
  defaultFirstName: string;
  defaultLastName: string;
  phone: string;
};

const STAMPS_REQUIRED = 10;

/**
 * Carte fidélité Rialto affichée sur /order/[id] pendant l'attente de la
 * commande. Si déjà activée → montre la progression. Sinon → formulaire
 * pour s'inscrire.
 */
export default function LoyaltyCardSignup({
  restaurantId,
  stampifyBaseUrl,
  defaultFirstName,
  defaultLastName,
  phone,
}: Props) {
  const [customer, setCustomer] = useState<RialtoCustomer | null>(null);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState(defaultFirstName);
  const [lastName, setLastName] = useState(defaultLastName);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check si le client est déjà enregistré
  useEffect(() => {
    (async () => {
      try {
        const url = `${stampifyBaseUrl}/api/rialto/customers/signup?restaurant_id=${encodeURIComponent(
          restaurantId,
        )}&phone=${encodeURIComponent(phone)}`;
        const res = await fetch(url);
        if (res.ok) {
          const body = (await res.json()) as { customer: RialtoCustomer | null };
          if (body.customer) setCustomer(body.customer);
        }
      } catch {
        /* ignore */
      }
      setLoading(false);
    })();
  }, [restaurantId, phone, stampifyBaseUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${stampifyBaseUrl}/api/rialto/customers/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          phone,
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          email: email.trim() || null,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? "Erreur");
        return;
      }
      const body = (await res.json()) as { customer: RialtoCustomer };
      setCustomer(body.customer);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return null;

  return (
    <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
      <div className="flex items-start gap-3">
        <div className="text-2xl">🎁</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-emerald-900">
            {customer
              ? `Bonjour ${customer.first_name} !`
              : "Gagnez votre prochaine commande"}
          </h3>
          <p className="mt-1 text-sm text-emerald-900/80">
            Chaque commande = 1 tampon. À {STAMPS_REQUIRED} tampons, recevez un
            plat de votre choix offert.
          </p>
        </div>
      </div>

      {customer ? (
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-semibold text-emerald-900">
              Votre carte : {customer.stamps_count} / {STAMPS_REQUIRED} tampons
            </span>
            {customer.stamps_count >= STAMPS_REQUIRED && (
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
            Votre prochaine commande créditera 1 tampon à la validation en caisse.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Prénom"
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Nom"
              className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
            />
          </div>
          <input
            value={phone}
            disabled
            className="w-full rounded-lg border border-emerald-200 bg-white/70 px-3 py-2 text-sm text-gray-500"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optionnel — pour recevoir les récompenses)"
            className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          {error && (
            <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-full bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? "…" : "Activer ma carte fidélité"}
          </button>
        </form>
      )}
    </section>
  );
}
