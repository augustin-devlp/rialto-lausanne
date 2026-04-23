"use client";

/**
 * Page /checkout refondue — delivery-only, sections séparées, typo Fraunces.
 * Reprend la logique de validation de l'ancien CheckoutForm.tsx (zones,
 * prep time, promo codes) mais sans pickup et sans payment en ligne.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { CartItem, CartOptionSelection } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import {
  cartCount,
  cartSubtotal,
  clearCart,
  readAddress,
  readCart,
  writeCart,
  type QualifiedAddress,
} from "@/lib/clientStore";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { RIALTO_INFO, matchDishImage } from "@/lib/rialto-data";
import UpsellPanel from "./UpsellPanel";

type Props = {
  restaurantId: string;
  accepting: boolean;
};

const STAMPIFY_BUSINESS_ID = "59b10af2-5dbc-4ddd-a659-c49f44804bff";

export default function CheckoutPageClient({ restaurantId, accepting }: Props) {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<QualifiedAddress | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [floorDoor, setFloorDoor] = useState("");
  const [instructions, setInstructions] = useState("");
  const [notes, setNotes] = useState("");
  const [asap, setAsap] = useState(true);
  const [pickupTime, setPickupTime] = useState(""); // HH:MM if !asap

  // Promo code
  const [promoInput, setPromoInput] = useState("");
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoChecking, setPromoChecking] = useState(false);
  const [promo, setPromo] = useState<{
    code: string;
    code_id: string;
    discount_amount: number;
    message: string;
    free_item_label: string | null;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = readCart();
    const a = readAddress();
    setCart(c);
    setAddress(a);
    if (!a) {
      router.replace("/?need_address=1");
      return;
    }
    if (c.length === 0) {
      router.replace("/menu");
    }
  }, [router]);

  const subtotal = useMemo(() => cartSubtotal(cart), [cart]);
  const count = cartCount(cart);
  const deliveryFee = address?.delivery_fee ?? 0;
  const promoDiscount = promo?.discount_amount ?? 0;
  const minAmount = address?.min_order_amount ?? RIALTO_INFO.minOrderCHF;
  const missing = Math.max(0, minAmount - subtotal);
  const total = Math.max(0, subtotal + deliveryFee - promoDiscount);

  function updateQuantity(key: string, delta: number) {
    const next = cart
      .map((c) => {
        if (c.key !== key) return c;
        const q = Math.max(0, c.quantity + delta);
        if (q === 0) return null;
        return { ...c, quantity: q, subtotal: c.unit_price * q };
      })
      .filter(Boolean) as CartItem[];
    setCart(next);
    writeCart(next);
  }

  // Phase 11 C12 : ajout d'un item suggéré par l'IA upsell
  async function addUpsellItem(menuItemId: string) {
    try {
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/menu-item/${menuItemId}`);
      let item: { id: string; name: string; price: number } | null = null;
      if (res.ok) {
        item = (await res.json()).item ?? null;
      }
      if (!item) return;
      const key = `${item.id}::::`;
      const existing = cart.find((c) => c.key === key);
      const next: CartItem[] = existing
        ? cart.map((c) =>
            c.key === key
              ? {
                  ...c,
                  quantity: c.quantity + 1,
                  subtotal: c.unit_price * (c.quantity + 1),
                }
              : c,
          )
        : [
            ...cart,
            {
              key,
              menu_item_id: item.id,
              name: item.name,
              base_price: item.price,
              quantity: 1,
              options: [],
              notes: "",
              unit_price: item.price,
              subtotal: item.price,
            },
          ];
      setCart(next);
      writeCart(next);
    } catch (err) {
      console.error("[upsell] add failed", err);
    }
  }

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

  const baseValid =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    phone.trim().length >= 8;
  const amountValid = missing === 0;
  const valid = baseValid && amountValid && !loading && !!address && accepting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !address) return;
    setLoading(true);
    setError(null);
    try {
      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone) {
        setError("Numéro invalide. Format accepté : +41 79…, +33 6…, etc.");
        setLoading(false);
        return;
      }
      const cleanPayer = payerPhone.trim() ? normalizePhone(payerPhone) : null;

      // Heure de livraison : ASAP ou HH:MM aujourd'hui
      let pickupISO: string | null = null;
      if (!asap && pickupTime) {
        const [h, m] = pickupTime.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        pickupISO = d.toISOString();
      }

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_name: `${firstName.trim()} ${lastName.trim()}`,
          customer_phone: cleanPhone,
          payer_phone: cleanPayer,
          requested_pickup_time: pickupISO,
          fulfillment_type: "delivery",
          delivery_address: address.address,
          delivery_postal_code: address.postal_code,
          delivery_city: address.city,
          delivery_floor_door: floorDoor.trim() || null,
          delivery_instructions: instructions.trim() || null,
          delivery_zone_id: address.zone_id,
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

      // Consomme le code promo si appliqué
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
          console.error("[checkout] promo apply failed", err);
        }
      }

      clearCart();
      router.push(`/confirmation/${body.order.order_number}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setLoading(false);
    }
  }

  if (!address) return null;

  return (
    <main className="min-h-screen bg-cream">
      {/* Header compact */}
      <header className="border-b border-border bg-cream/95 backdrop-blur-lg">
        <div className="container-hero flex h-14 items-center justify-between gap-3 sm:h-16">
          <Link
            href="/menu"
            className="flex items-center gap-2 text-sm font-medium text-ink hover:text-rialto"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Retour au menu
          </Link>
          <span className="font-display text-sm font-semibold md:text-base">
            Finaliser la commande
          </span>
          <span className="w-[90px]" />
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="container-hero grid grid-cols-1 gap-10 py-10 lg:grid-cols-[1fr,420px] lg:gap-14 lg:py-16"
      >
        {/* ─── Colonne gauche : sections ─────────────────────── */}
        <div className="space-y-10">
          {/* Panier */}
          <Section title="Votre panier" step="01">
            <div className="space-y-3">
              {cart.map((item) => (
                <CartLineRow
                  key={item.key}
                  item={item}
                  onIncr={() => updateQuantity(item.key, 1)}
                  onDecr={() => updateQuantity(item.key, -1)}
                />
              ))}
            </div>
            {/* Phase 11 C12 : upsell IA Gemini */}
            <UpsellPanel cart={cart} onAdd={addUpsellItem} />
          </Section>

          {/* Où livrer */}
          <Section title="Où livrer ?" step="02">
            <div className="rounded-2xl border border-border bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#C73E1D">
                    <path d="M12 2C7.58 2 4 5.58 4 10c0 7 8 12 8 12s8-5 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-base font-semibold text-ink">
                    {address.address}
                  </div>
                  <div className="text-sm text-mute">
                    {address.postal_code} {address.city ?? ""}
                  </div>
                </div>
                <Link
                  href="/"
                  className="text-xs font-semibold text-rialto hover:underline"
                >
                  Changer
                </Link>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Étage / code d'entrée">
                  <input
                    type="text"
                    value={floorDoor}
                    onChange={(e) => setFloorDoor(e.target.value)}
                    placeholder="3e · porte gauche"
                    className="input-compact"
                  />
                </Field>
                <Field label="Instructions livreur">
                  <input
                    type="text"
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Sonner 2 fois"
                    className="input-compact"
                  />
                </Field>
              </div>
            </div>
          </Section>

          {/* Quand */}
          <Section title="Quand livrer ?" step="03">
            <div className="grid grid-cols-2 gap-3">
              <RadioTile
                checked={asap}
                onChange={() => setAsap(true)}
                title="Dès que possible"
                subtitle={`~${address.estimated_delivery_minutes} min`}
              />
              <RadioTile
                checked={!asap}
                onChange={() => setAsap(false)}
                title="À une heure précise"
                subtitle="Choisir un créneau"
              />
            </div>
            {!asap && (
              <div className="mt-3">
                <input
                  type="time"
                  value={pickupTime}
                  onChange={(e) => setPickupTime(e.target.value)}
                  className="input"
                  step={900}
                  required
                />
              </div>
            )}
          </Section>

          {/* Contact */}
          <Section title="Vos coordonnées" step="04">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Prénom" required>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="input"
                  required
                />
              </Field>
              <Field label="Nom" required>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className="input"
                  required
                />
              </Field>
            </div>
            <Field
              label="Téléphone"
              required
              hint="CH (+41…) ou FR (+33…) — pour qu'on vous appelle en cas de souci"
            >
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+41 79 123 45 67"
                autoComplete="tel"
                className="input"
                required
              />
            </Field>
            <Field
              label="Téléphone du payeur"
              hint="Si quelqu'un paie à votre place"
            >
              <input
                type="tel"
                value={payerPhone}
                onChange={(e) => setPayerPhone(e.target.value)}
                placeholder="Optionnel"
                className="input"
              />
            </Field>
          </Section>

          {/* Code promo */}
          <Section title="Code promo" step="05" optional>
            {promo ? (
              <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div>
                  <div className="text-sm font-semibold text-emerald-800">
                    ✓ {promo.code}
                  </div>
                  <div className="text-xs text-emerald-700">{promo.message}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPromo(null);
                    setPromoInput("");
                  }}
                  className="text-xs font-semibold text-emerald-800 underline"
                >
                  Retirer
                </button>
              </div>
            ) : promoOpen ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoInput}
                    onChange={(e) =>
                      setPromoInput(e.target.value.toUpperCase())
                    }
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
                    className="btn-ghost"
                  >
                    {promoChecking ? "…" : "Appliquer"}
                  </button>
                </div>
                {promoError && (
                  <p className="text-xs text-rialto">⚠️ {promoError}</p>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setPromoOpen(true)}
                className="text-sm font-medium text-rialto hover:underline"
              >
                + Saisir un code
              </button>
            )}
          </Section>

          {/* Notes générales */}
          <Section title="Notes" step="06" optional>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Allergies, précisions générales…"
              className="input resize-none"
              maxLength={300}
            />
          </Section>

          {/* Paiement */}
          <Section title="Paiement" step="07">
            <div className="flex items-start gap-4 rounded-2xl border-2 border-saffron bg-saffron/10 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-saffron text-white">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <div>
                <h4 className="font-display text-lg font-semibold">
                  Paiement à la livraison
                </h4>
                <p className="mt-0.5 text-sm text-ink/80">
                  Vous paierez <span className="tabular font-semibold">{formatCHF(total)}</span>{" "}
                  au livreur en cash, TWINT ou carte bancaire.
                </p>
              </div>
            </div>
          </Section>
        </div>

        {/* ─── Colonne droite : récap + CTA ──────────────────── */}
        <aside className="lg:sticky lg:top-8 lg:h-fit">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-card">
            <h3 className="font-display text-xl font-bold">Récapitulatif</h3>
            <dl className="mt-5 space-y-2 text-sm">
              <Row
                label={`Sous-total (${count} article${count > 1 ? "s" : ""})`}
                value={formatCHF(subtotal)}
              />
              <Row
                label="Frais de livraison"
                value={formatCHF(deliveryFee)}
              />
              {promo && promoDiscount > 0 && (
                <Row
                  label={`Code ${promo.code}`}
                  value={`−${formatCHF(promoDiscount)}`}
                  accent
                />
              )}
              <div className="border-t border-border pt-3">
                <Row
                  label="Total"
                  value={formatCHF(total)}
                  emphasis
                />
              </div>
            </dl>

            {missing > 0 && (
              <div className="mt-4 rounded-xl bg-rialto/10 p-3 text-xs font-medium text-rialto">
                Ajoutez {formatCHF(missing)} pour atteindre le minimum de
                livraison ({formatCHF(minAmount)}).
              </div>
            )}

            {!accepting && (
              <div className="mt-4 rounded-xl bg-ink/5 p-3 text-xs font-medium text-ink">
                Nous ne prenons plus de commandes pour le moment. Revenez dans
                quelques instants.
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!valid}
              className="btn-primary-lg mt-5 w-full"
            >
              {loading ? "Envoi…" : `Commander · ${formatCHF(total)}`}
            </button>

            <p className="mt-3 text-center text-xs text-mute">
              Paiement au livreur · Livré en ~{address.estimated_delivery_minutes}
              &nbsp;min
            </p>
          </div>
        </aside>
      </form>
    </main>
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

function Section({
  title,
  step,
  optional,
  children,
}: {
  title: string;
  step: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <span className="tabular font-display text-xs font-semibold text-rialto">
          {step}
        </span>
        <h2 className="font-display text-xl font-bold md:text-2xl">
          {title}
          {optional && (
            <span className="ml-2 text-xs font-normal text-mute">
              (optionnel)
            </span>
          )}
        </h2>
      </div>
      {children}
    </section>
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
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-rialto">*</span>}
      </span>
      {children}
      {hint && <p className="mt-1 text-xs text-mute">{hint}</p>}
    </label>
  );
}

function RadioTile({
  checked,
  onChange,
  title,
  subtitle,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`rounded-2xl border-2 p-4 text-left transition ${
        checked
          ? "border-rialto bg-rialto/5"
          : "border-border bg-white hover:border-ink"
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-0.5 text-xs text-mute">{subtitle}</div>
    </button>
  );
}

function Row({
  label,
  value,
  emphasis,
  accent,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between ${
        emphasis ? "text-base font-semibold" : ""
      } ${accent ? "text-emerald-700" : ""}`}
    >
      <dt className={emphasis ? "font-display" : "text-mute"}>{label}</dt>
      <dd className={`tabular ${emphasis ? "font-display font-bold" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function CartLineRow({
  item,
  onIncr,
  onDecr,
}: {
  item: CartItem;
  onIncr: () => void;
  onDecr: () => void;
}) {
  const image = matchDishImage(item.name);
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
        <Image
          src={image}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm font-semibold">
          {item.name}
        </div>
        {item.options.length > 0 && (
          <div className="mt-0.5 truncate text-xs text-mute">
            {item.options.map((o) => o.name).join(" · ")}
          </div>
        )}
        {item.notes && (
          <div className="mt-0.5 truncate text-xs text-mute italic">
            « {item.notes} »
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-cream px-2 py-0.5">
            <button
              type="button"
              onClick={onDecr}
              className="flex h-6 w-6 items-center justify-center text-ink hover:text-rialto"
              aria-label="Diminuer"
            >
              −
            </button>
            <span className="tabular min-w-[16px] text-center text-sm font-semibold">
              {item.quantity}
            </span>
            <button
              type="button"
              onClick={onIncr}
              className="flex h-6 w-6 items-center justify-center text-ink hover:text-rialto"
              aria-label="Augmenter"
            >
              +
            </button>
          </div>
          <span className="tabular ml-auto font-display text-sm font-semibold">
            {formatCHF(item.subtotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
