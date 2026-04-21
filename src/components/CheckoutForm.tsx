"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartItem, DeliveryZone, FulfillmentType, Restaurant } from "@/lib/types";
import { buildPickupTimeSlots, formatCHF } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { pickupFromZurichHHMM } from "@/lib/timezone";
import PickupTimePicker from "./PickupTimePicker";

type Props = {
  restaurant: Restaurant;
  cart: CartItem[];
  subtotal: number;
  onClose: () => void;
  onSuccess: () => void;
};

const STAMPIFY_BASE =
  process.env.NEXT_PUBLIC_STAMPIFY_URL ?? "https://www.stampify.ch";

export default function CheckoutForm({
  restaurant,
  cart,
  subtotal,
  onClose,
  onSuccess,
}: Props) {
  const offersPickup = restaurant.offers_pickup ?? true;
  const offersDelivery = restaurant.offers_delivery ?? false;

  const [fulfillmentType, setFulfillmentType] = useState<FulfillmentType>(
    offersPickup ? "pickup" : "delivery",
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Pickup time
  const slots = useMemo(
    () =>
      buildPickupTimeSlots(
        restaurant.order_open_time,
        restaurant.order_close_time,
        restaurant.prep_time_minutes,
      ),
    [restaurant],
  );
  const [pickup, setPickup] = useState(slots[0] ?? "");

  // Delivery fields
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [floorDoor, setFloorDoor] = useState("");
  const [instructions, setInstructions] = useState("");
  const [asap, setAsap] = useState(true);

  // Zone lookup
  const [zone, setZone] = useState<DeliveryZone | null>(null);
  const [zoneChecking, setZoneChecking] = useState(false);
  const [zoneError, setZoneError] = useState<string | null>(null);

  // Prep time dynamique
  const [prepLabel, setPrepLabel] = useState<string | null>(null);

  // --- Code promo ---
  const [promoInput, setPromoInput] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  const [promo, setPromo] = useState<{
    code: string;
    code_id: string;
    discount_amount: number;
    message: string;
    free_item_label: string | null;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const STAMPIFY_BUSINESS_ID = "59b10af2-5dbc-4ddd-a659-c49f44804bff"; // Rialto

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoChecking(true);
    setPromoError(null);
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/promo-codes/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          business_id: STAMPIFY_BUSINESS_ID,
          code,
          subtotal,
        }),
      });
      const body = (await res.json()) as {
        valid: boolean;
        error?: string;
        code_id?: string;
        code?: string;
        discount_amount?: number;
        message?: string;
        free_item_label?: string | null;
      };
      if (!body.valid) {
        setPromo(null);
        setPromoError(body.error ?? "Code invalide");
      } else {
        setPromo({
          code: body.code!,
          code_id: body.code_id!,
          discount_amount: body.discount_amount ?? 0,
          message: body.message ?? "",
          free_item_label: body.free_item_label ?? null,
        });
        setPromoError(null);
      }
    } catch {
      setPromoError("Erreur réseau");
    } finally {
      setPromoChecking(false);
    }
  }

  function clearPromo() {
    setPromo(null);
    setPromoInput("");
    setPromoError(null);
  }

  const deliveryFee = zone?.delivery_fee ?? 0;
  const promoDiscount = promo?.discount_amount ?? 0;
  const total = Math.max(
    0,
    Number(subtotal) + Number(deliveryFee) - Number(promoDiscount),
  );
  const minAmount =
    fulfillmentType === "delivery"
      ? (zone?.min_order_amount ?? 0)
      : restaurant.order_min_amount;
  const missingAmount = Math.max(0, minAmount - subtotal);

  // Vérifie le zonage à chaque changement de code postal
  useEffect(() => {
    if (fulfillmentType !== "delivery") {
      setZone(null);
      setZoneError(null);
      return;
    }
    const pc = postalCode.trim();
    if (pc.length !== 4) {
      setZone(null);
      setZoneError(null);
      return;
    }
    let cancelled = false;
    setZoneChecking(true);
    setZoneError(null);
    (async () => {
      try {
        const res = await fetch(
          `${STAMPIFY_BASE}/api/delivery-zones/check?restaurant_id=${encodeURIComponent(
            restaurant.id,
          )}&postal_code=${encodeURIComponent(pc)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setZoneError("Erreur de vérification de zone.");
          setZone(null);
        } else {
          const body = (await res.json()) as {
            covered: boolean;
            zone?: DeliveryZone;
          };
          if (body.covered && body.zone) {
            setZone(body.zone);
            setZoneError(null);
          } else {
            setZone(null);
            setZoneError(
              `Nous ne livrons pas au ${pc}. Optez pour le retrait en magasin.`,
            );
          }
        }
      } catch {
        if (!cancelled) setZoneError("Erreur réseau.");
      } finally {
        if (!cancelled) setZoneChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fulfillmentType, postalCode, restaurant.id]);

  // Prep time dynamique (appel à chaque changement de mode ou de zone)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pc = fulfillmentType === "delivery" ? zone?.postal_code : undefined;
      const url = new URL(
        `${STAMPIFY_BASE}/api/restaurants/${restaurant.id}/prep-time`,
      );
      url.searchParams.set("type", fulfillmentType);
      if (pc) url.searchParams.set("postal_code", pc);
      try {
        const res = await fetch(url.toString());
        if (cancelled || !res.ok) return;
        const body = (await res.json()) as { label: string };
        setPrepLabel(body.label);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fulfillmentType, zone?.postal_code, restaurant.id]);

  const baseValid =
    firstName.trim() && lastName.trim() && phone.trim() && !loading;
  const pickupValid = fulfillmentType !== "pickup" || !!pickup;
  const deliveryValid =
    fulfillmentType !== "delivery" ||
    (address.trim() && zone && !zoneChecking && subtotal >= minAmount);
  const valid = baseValid && pickupValid && deliveryValid && missingAmount === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone) {
        setError(
          "Numéro invalide. Format accepté : +41 79…, +33 6…, etc.",
        );
        setLoading(false);
        return;
      }
      const cleanPayer = payerPhone.trim() ? normalizePhone(payerPhone) : null;

      let pickupISO: string | null = null;
      if (fulfillmentType === "pickup") {
        pickupISO = pickupFromZurichHHMM(pickup).toISOString();
      } else if (!asap) {
        pickupISO = pickupFromZurichHHMM(pickup).toISOString();
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          customer_name: `${firstName.trim()} ${lastName.trim()}`,
          customer_phone: cleanPhone,
          payer_phone: cleanPayer,
          requested_pickup_time: pickupISO,
          fulfillment_type: fulfillmentType,
          delivery_address:
            fulfillmentType === "delivery" ? address.trim() : null,
          delivery_postal_code:
            fulfillmentType === "delivery" ? postalCode.trim() : null,
          delivery_city:
            fulfillmentType === "delivery" ? zone?.city ?? null : null,
          delivery_floor_door:
            fulfillmentType === "delivery" ? floorDoor.trim() || null : null,
          delivery_instructions:
            fulfillmentType === "delivery" ? instructions.trim() || null : null,
          delivery_zone_id:
            fulfillmentType === "delivery" ? zone?.id ?? null : null,
          notes: notes.trim() || null,
          items: cart.map((c) => ({
            menu_item_id: c.menu_item_id,
            item_name_snapshot: c.name,
            item_price_snapshot: c.base_price,
            quantity: c.quantity,
            selected_options: c.options,
            subtotal: c.subtotal,
            notes: c.notes || null,
          })),
        }),
      });
      const body = await res.json();
      if (!res.ok || !body?.order?.id) {
        throw new Error(body?.error ?? "Erreur lors de la commande");
      }

      // Si un code promo a été validé, on le consomme maintenant
      if (promo) {
        try {
          await fetch(`${STAMPIFY_BASE}/api/promo-codes/apply`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              business_id: STAMPIFY_BUSINESS_ID,
              code: promo.code,
              order_id: body.order.id,
              subtotal,
            }),
          });
        } catch (err) {
          console.error("[checkout] promo apply failed (non-blocking)", err);
        }
      }

      onSuccess();
      router.push(`/order/${body.order.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setError(msg);
      setLoading(false);
    }
  };

  const showBothModes = offersPickup && offersDelivery;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="flex max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-white sm:rounded-3xl"
      >
        <header className="flex items-center justify-between border-b border-gray-100 p-5">
          <h3 className="text-xl font-bold">Finaliser la commande</h3>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 -mt-2 rounded-full p-2 text-mute transition hover:bg-surface"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Sélecteur pickup/delivery */}
          {showBothModes && (
            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setFulfillmentType("pickup")}
                className={`rounded-xl border-2 p-3 text-center transition ${
                  fulfillmentType === "pickup"
                    ? "border-rialto bg-rialto/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="text-2xl">🏪</div>
                <div className="mt-1 text-sm font-semibold">Retrait en magasin</div>
                <div className="text-[11px] text-mute">Gratuit</div>
              </button>
              <button
                type="button"
                onClick={() => setFulfillmentType("delivery")}
                className={`rounded-xl border-2 p-3 text-center transition ${
                  fulfillmentType === "delivery"
                    ? "border-rialto bg-rialto/5"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="text-2xl">🚴</div>
                <div className="mt-1 text-sm font-semibold">Livraison</div>
                <div className="text-[11px] text-mute">à domicile</div>
              </button>
            </div>
          )}

          {prepLabel && (
            <div className="mb-4 rounded-lg bg-surface p-3 text-center text-xs font-medium text-ink">
              ⏱️ {prepLabel}
            </div>
          )}

          {/* Récap */}
          <div className="mb-5 rounded-xl bg-surface p-4">
            <div className="mb-2 text-sm font-semibold">Récapitulatif</div>
            <ul className="mb-2 space-y-1 text-sm">
              {cart.map((c) => (
                <li key={c.key} className="flex justify-between">
                  <span>{c.quantity}× {c.name}</span>
                  <span>{formatCHF(c.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="space-y-1 border-t border-gray-200 pt-2 text-sm">
              <div className="flex justify-between">
                <span className="text-mute">Sous-total</span>
                <span>{formatCHF(subtotal)}</span>
              </div>
              {fulfillmentType === "delivery" && (
                <div className="flex justify-between">
                  <span className="text-mute">Livraison</span>
                  <span>
                    {zone ? formatCHF(deliveryFee) : "—"}
                  </span>
                </div>
              )}
              {promo && promoDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Code {promo.code}</span>
                  <span>−{formatCHF(promoDiscount)}</span>
                </div>
              )}
              {promo && promo.free_item_label && (
                <div className="flex justify-between text-emerald-700">
                  <span>Code {promo.code}</span>
                  <span>{promo.free_item_label} offert</span>
                </div>
              )}
              <div className="flex justify-between border-t border-gray-200 pt-1 font-bold">
                <span>Total</span>
                <span>{formatCHF(total)}</span>
              </div>
            </div>
            {fulfillmentType === "delivery" && zone && missingAmount > 0 && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-800">
                Commande minimum : {formatCHF(minAmount)} pour {zone.city ?? zone.postal_code}.
                Ajoutez <strong>{formatCHF(missingAmount)}</strong> pour pouvoir livrer.
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" required>
              <input type="text" required autoComplete="given-name"
                value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input" />
            </Field>
            <Field label="Nom" required>
              <input type="text" required autoComplete="family-name"
                value={lastName} onChange={(e) => setLastName(e.target.value)} className="input" />
            </Field>
          </div>

          <Field label="Téléphone" required hint="Format CH (+41…) ou FR (+33…) accepté">
            <input type="tel" required inputMode="tel" autoComplete="tel"
              placeholder="+41 79 123 45 67"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              className="input" />
          </Field>

          {fulfillmentType === "pickup" && (
            <>
              <Field label="Heure de retrait" required>
                <PickupTimePicker
                  openTime={restaurant.order_open_time}
                  closeTime={restaurant.order_close_time}
                  prepMinutes={restaurant.prep_time_minutes}
                  value={pickup}
                  onChange={setPickup}
                />
              </Field>
              <div className="mb-4 rounded-lg bg-surface p-3 text-xs text-mute">
                🏪 Retrait : {restaurant.address ?? "Av. de Béthusy 29, Lausanne"}
              </div>
            </>
          )}

          {fulfillmentType === "delivery" && (
            <>
              <Field label="Code postal" required>
                <input
                  type="text" required inputMode="numeric" pattern="[0-9]{4}"
                  placeholder="1012"
                  maxLength={4}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, ""))}
                  className="input"
                />
                {zoneChecking && (
                  <p className="mt-1 text-xs text-mute">Vérification…</p>
                )}
                {zone && !zoneChecking && (
                  <p className="mt-1 text-xs text-emerald-700">
                    ✓ Zone {zone.city ?? zone.postal_code} — {formatCHF(zone.delivery_fee)}{" "}
                    · min. {formatCHF(zone.min_order_amount)} · ~{zone.estimated_delivery_minutes} min
                  </p>
                )}
                {zoneError && !zoneChecking && (
                  <p className="mt-1 text-xs text-red-700">⚠️ {zoneError}</p>
                )}
              </Field>

              <Field label="Adresse complète" required hint="Rue et numéro">
                <input type="text" required value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Av. de Béthusy 29"
                  className="input" />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Étage / code d'entrée">
                  <input type="text" value={floorDoor}
                    onChange={(e) => setFloorDoor(e.target.value)}
                    placeholder="3e étage · porte gauche"
                    className="input" />
                </Field>
                <Field label="Téléphone du payeur" hint="Si quelqu'un paye à votre place">
                  <input type="tel" value={payerPhone}
                    onChange={(e) => setPayerPhone(e.target.value)}
                    placeholder="+41 79 999 88 77"
                    className="input" />
                </Field>
              </div>

              <Field label="Instructions livreur">
                <textarea rows={2} value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="input resize-none"
                  placeholder="Ex. sonner 2 fois, laisser devant la porte…" />
              </Field>

              <Field label="Heure de livraison">
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={asap} onChange={() => setAsap(true)}
                      className="accent-rialto" />
                    Dès que possible
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="radio" checked={!asap} onChange={() => setAsap(false)}
                      className="accent-rialto" />
                    À une heure précise
                  </label>
                  {!asap && (
                    <PickupTimePicker
                      openTime={restaurant.order_open_time}
                      closeTime={restaurant.order_close_time}
                      prepMinutes={restaurant.prep_time_minutes}
                      value={pickup}
                      onChange={setPickup}
                    />
                  )}
                </div>
              </Field>
            </>
          )}

          <Field label="Code promo" hint="Si vous avez gagné un code à la roue ou reçu un bon cadeau">
            {promo ? (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-800">
                    ✓ {promo.code}
                  </div>
                  <div className="text-xs text-emerald-700">{promo.message}</div>
                </div>
                <button
                  type="button"
                  onClick={clearPromo}
                  className="text-xs font-semibold text-emerald-800 underline"
                >
                  Retirer
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promoInput}
                  onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                  placeholder="RIA-XXXXX"
                  className="input flex-1"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={applyPromo}
                  disabled={!promoInput.trim() || promoChecking}
                  className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {promoChecking ? "…" : "OK"}
                </button>
              </div>
            )}
            {promoError && (
              <p className="mt-1 text-xs text-red-700">⚠️ {promoError}</p>
            )}
          </Field>

          <Field label="Notes (allergies, précisions)">
            <textarea rows={2} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input resize-none"
              placeholder="Ex. allergie aux noix…" />
          </Field>

          <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
            <div className="mb-1 font-semibold">💰 Paiement sur place</div>
            <div className="text-mute">
              Espèces, TWINT ou carte bancaire{" "}
              {fulfillmentType === "delivery"
                ? "— réglé au livreur."
                : "— réglé au comptoir."}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-gray-100 p-4">
          <button
            type="submit"
            disabled={!valid}
            className={`w-full rounded-full px-5 py-4 text-sm font-semibold text-white shadow-sm transition ${
              valid
                ? "bg-rialto hover:bg-rialto-dark active:scale-[0.98]"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            {loading
              ? "Envoi…"
              : `Confirmer · ${formatCHF(total)}`}
          </button>
        </footer>
      </form>

      <style jsx>{`
        .input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid #e5e7eb;
          padding: 0.65rem 0.85rem;
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.15s;
        }
        .input:focus { border-color: #e30613; }
      `}</style>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4 col-span-full sm:[&:nth-child(-n+2)]:col-span-1">
      <label className="mb-1 block text-sm font-semibold">
        {label}
        {required && <span className="ml-0.5 text-rialto">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </div>
  );
}
