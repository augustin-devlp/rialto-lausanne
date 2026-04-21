"use client";

/**
 * Champ de qualification d'adresse sur la homepage. Valide un code postal
 * suisse (4 chiffres) contre /api/delivery-zones/check. Si zone couverte :
 *   1. écrit l'adresse qualifiée en localStorage
 *   2. redirige vers /menu
 * Sinon affiche une modale "On ne livre pas chez vous".
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { writeAddress, readAddress } from "@/lib/clientStore";
import { DELIVERY_CITIES } from "@/lib/rialto-data";

type Props = {
  restaurantId: string;
  minOrderFallback: number;
  /** Style plein (sombre sur fond clair) ou overlay (clair sur fond photo) */
  variant?: "solid" | "overlay";
};

export default function AddressGate({
  restaurantId,
  minOrderFallback,
  variant = "solid",
}: Props) {
  const router = useRouter();
  const [postalCode, setPostalCode] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [modalKind, setModalKind] = useState<null | "not-covered" | "error">(null);
  const [modalText, setModalText] = useState<string>("");

  // Pré-remplir si l'utilisateur a déjà qualifié une adresse auparavant
  useEffect(() => {
    const existing = readAddress();
    if (existing) {
      setPostalCode(existing.postal_code);
      setStreetAddress(existing.address);
    }
  }, []);

  const valid = postalCode.trim().length === 4 && streetAddress.trim().length >= 3;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || loading) return;
    setLoading(true);
    try {
      const url = new URL(`${STAMPIFY_BASE}/api/delivery-zones/check`);
      url.searchParams.set("restaurant_id", restaurantId);
      url.searchParams.set("postal_code", postalCode.trim());
      const res = await fetch(url.toString());
      if (!res.ok) {
        setModalKind("error");
        setModalText(
          "Nous n'arrivons pas à vérifier votre adresse pour l'instant. Réessayez dans quelques secondes.",
        );
        return;
      }
      const body = (await res.json()) as {
        covered: boolean;
        zone?: {
          id: string;
          postal_code: string;
          city: string | null;
          delivery_fee: number;
          min_order_amount: number;
          estimated_delivery_minutes: number;
        };
      };
      if (!body.covered || !body.zone) {
        setModalKind("not-covered");
        return;
      }
      writeAddress({
        address: streetAddress.trim(),
        postal_code: body.zone.postal_code,
        city: body.zone.city,
        zone_id: body.zone.id,
        delivery_fee: Number(body.zone.delivery_fee),
        min_order_amount: Number(body.zone.min_order_amount ?? minOrderFallback),
        estimated_delivery_minutes: body.zone.estimated_delivery_minutes,
      });
      router.push("/menu");
    } catch {
      setModalKind("error");
      setModalText("Erreur réseau. Vérifiez votre connexion et réessayez.");
    } finally {
      setLoading(false);
    }
  }

  const isOverlay = variant === "overlay";

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className={`${
          isOverlay
            ? "bg-white/95 backdrop-blur-md shadow-pop"
            : "bg-white shadow-card"
        } relative z-10 flex flex-col gap-2 rounded-2xl p-2.5 sm:flex-row sm:items-stretch sm:gap-0 sm:p-2`}
      >
        {/* Icône + input rue */}
        <div className="flex flex-1 items-center gap-2 px-3 py-2 sm:border-r sm:border-border">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#C73E1D"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
            aria-hidden
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          <input
            type="text"
            value={streetAddress}
            onChange={(e) => setStreetAddress(e.target.value)}
            placeholder="Votre rue et numéro"
            autoComplete="street-address"
            className="w-full border-0 bg-transparent py-2 text-sm text-ink placeholder-mute outline-none sm:text-base"
            required
          />
        </div>

        {/* Code postal */}
        <div className="flex items-center gap-2 px-3 py-2 sm:border-r sm:border-border">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            value={postalCode}
            onChange={(e) =>
              setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="CP"
            aria-label="Code postal"
            className="w-full border-0 bg-transparent py-2 text-sm text-ink placeholder-mute outline-none sm:w-20 sm:text-base"
            required
          />
        </div>

        <button
          type="submit"
          disabled={!valid || loading}
          className="btn-primary !rounded-xl !py-3 sm:!rounded-2xl sm:!px-6"
        >
          {loading ? "Vérification…" : "Voir le menu"}
          {!loading && (
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          )}
        </button>
      </form>

      {/* Modale non couvert */}
      {modalKind === "not-covered" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-fade-in"
          onClick={() => setModalKind(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white p-7 shadow-pop"
          >
            <div className="flex items-start gap-3">
              <div className="shrink-0 text-3xl">😔</div>
              <div>
                <h3 className="font-display text-xl font-semibold leading-tight">
                  On ne livre pas au {postalCode} pour le moment
                </h3>
                <p className="mt-2 text-sm text-mute">
                  Rialto dessert actuellement les quartiers suivants :
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {DELIVERY_CITIES.map((c) => (
                    <li
                      key={c}
                      className="rounded-full bg-cream-dark px-3 py-1 text-xs font-semibold text-ink"
                    >
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-mute">
                  Vous pouvez aussi appeler le restaurant pour vérifier votre
                  adresse : <strong>021 312 64 60</strong>
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalKind(null)}
                className="btn-ghost"
              >
                Essayer une autre adresse
              </button>
            </div>
          </div>
        </div>
      )}

      {modalKind === "error" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalKind(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white p-7 shadow-pop"
          >
            <h3 className="font-display text-xl font-semibold">Erreur</h3>
            <p className="mt-2 text-sm text-mute">{modalText}</p>
            <button
              type="button"
              onClick={() => setModalKind(null)}
              className="btn-primary mt-5"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
