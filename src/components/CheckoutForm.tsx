"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CartItem, Restaurant } from "@/lib/types";
import { buildPickupTimeSlots, formatCHF, sanitizePhoneCH } from "@/lib/format";

type Props = {
  restaurant: Restaurant;
  cart: CartItem[];
  subtotal: number;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CheckoutForm({
  restaurant,
  cart,
  subtotal,
  onClose,
  onSuccess,
}: Props) {
  const slots = useMemo(
    () =>
      buildPickupTimeSlots(
        restaurant.order_open_time,
        restaurant.order_close_time,
        restaurant.prep_time_minutes,
      ),
    [restaurant],
  );
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [pickup, setPickup] = useState(slots[0] ?? "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const valid =
    firstName.trim() && lastName.trim() && phone.trim() && pickup && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      const cleanPhone = sanitizePhoneCH(phone);
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurant.id,
          customer_name: `${firstName.trim()} ${lastName.trim()}`,
          customer_phone: cleanPhone,
          requested_pickup_time: pickup,
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
      onSuccess();
      router.push(`/order/${body.order.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setError(msg);
      setLoading(false);
    }
  };

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
          <div className="mb-5 rounded-xl bg-surface p-4">
            <div className="mb-2 text-sm font-semibold">Récapitulatif</div>
            <ul className="mb-2 space-y-1 text-sm">
              {cart.map((c) => (
                <li key={c.key} className="flex justify-between">
                  <span>
                    {c.quantity}× {c.name}
                  </span>
                  <span>{formatCHF(c.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between border-t border-gray-200 pt-2 text-sm font-bold">
              <span>Total</span>
              <span>{formatCHF(subtotal)}</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" required>
              <input
                type="text"
                required
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="input"
              />
            </Field>
            <Field label="Nom" required>
              <input
                type="text"
                required
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="input"
              />
            </Field>
          </div>

          <Field label="Téléphone" required hint="Format suisse : +41 …">
            <input
              type="tel"
              required
              inputMode="tel"
              autoComplete="tel"
              placeholder="+41 79 123 45 67"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="input"
            />
          </Field>

          <Field label="Heure de retrait" required>
            <select
              required
              value={pickup}
              onChange={(e) => setPickup(e.target.value)}
              className="input"
            >
              {slots.length === 0 ? (
                <option value="">Hors horaires d'ouverture</option>
              ) : (
                slots.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))
              )}
            </select>
          </Field>

          <Field label="Notes (allergies, précisions)">
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input resize-none"
              placeholder="Ex. allergie aux noix…"
            />
          </Field>

          <div className="mt-3 rounded-xl bg-surface p-4 text-sm">
            <div className="mb-1 font-semibold">
              💰 Paiement en magasin uniquement
            </div>
            <div className="text-mute">
              Espèces ou TWINT · Retrait : {restaurant.address}
            </div>
          </div>

          {error && (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <footer className="border-t border-gray-100 p-4">
          <button type="submit" disabled={!valid} className="btn-primary w-full">
            {loading ? "Envoi…" : `Confirmer la commande · ${formatCHF(subtotal)}`}
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
        .input:focus {
          border-color: #e30613;
        }
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
