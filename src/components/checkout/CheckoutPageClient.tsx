"use client";

/**
 * Page /checkout — livraison OU à emporter.
 *
 * Livraison : type de logement → adresse (champs adaptatifs) → heure → paiement
 *   → coordonnées. Minimum + frais selon la zone qualifiée sur la home.
 * À emporter : retrait au restaurant → heure de retrait → paiement → coordonnées.
 *   Pas d'adresse ni de zone ; minimum de base du restaurant conservé.
 *
 * Préremplissage silencieux via localStorage RIALTO:CHECKOUT_PREFILL:V1.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { CartItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import {
  cartCount,
  cartSubtotal,
  clearCart,
  readAddress,
  readCart,
  readFulfillment,
  writeCart,
  writeFulfillment,
  type FulfillmentMode,
  type QualifiedAddress,
} from "@/lib/clientStore";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { RIALTO_INFO, matchDishImage } from "@/lib/rialto-data";
import FulfillmentToggle from "@/components/ui/FulfillmentToggle";
import UpsellPanel from "./UpsellPanel";

type Props = {
  restaurantId: string;
  accepting: boolean;
};

const STAMPIFY_BUSINESS_ID = "59b10af2-5dbc-4ddd-a659-c49f44804bff";

// Numéro du restaurant Rialto (paiement carte à distance / contact commande)
const PHONE_OF_MEHMET = "021 312 64 64";

const PREFILL_KEY = "RIALTO:CHECKOUT_PREFILL:V1";

// Marge de sécurité (min) ajoutée au temps de prépa pour le retrait "ASAP",
// afin de passer la validation backend (heure >= maintenant + prep).
const PICKUP_ASAP_BUFFER_MIN = 5;

type HousingType = "house" | "apartment";
type PaymentMethod = "card" | "cash" | "twint";
type CardTiming = "on_delivery" | "remote";

type Prefill = {
  housingType?: HousingType;
  street?: string;
  postalCode?: string;
  city?: string;
  entryCode1?: string;
  entryCode2?: string;
  floor?: string;
  apartmentNumber?: string;
  doorbellName?: string;
  instructions?: string;
  firstName?: string;
  phone?: string;
  email?: string;
};

function readPrefill(): Prefill {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PREFILL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Prefill;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writePrefill(p: Prefill): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFILL_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Classe d'une carte de sélection (logement, paiement, heure…). */
function selectionCard(active: boolean): string {
  return `rounded-2xl border-2 p-4 text-left transition-all ${
    active
      ? "border-rialto bg-rialto-50 shadow-card"
      : "border-border bg-white hover:border-ink/25"
  }`;
}

/* ─── Calcul des billets cash (CHF) ─────────────────────────────────── */
type CashOption = { label: string; value: number; notes: string };

function getCashOptions(total: number): CashOption[] {
  const billets = [10, 20, 50, 100, 200];
  const options: CashOption[] = [];

  for (const b of billets) {
    if (b >= total && b <= total + 100) {
      const rendu = b - total;
      options.push({
        label: `1 billet de ${b} CHF`,
        value: b,
        notes: rendu > 0 ? `Rendu : ${rendu.toFixed(2)} CHF` : "Compte juste",
      });
    }
  }
  for (const b of billets) {
    const sum = b * 2;
    if (sum >= total && sum <= total + 50) {
      const rendu = sum - total;
      options.push({
        label: `2 billets de ${b} CHF`,
        value: sum,
        notes: rendu > 0 ? `Rendu : ${rendu.toFixed(2)} CHF` : "Compte juste",
      });
    }
  }
  const combos: [number, number][] = [
    [50, 20],
    [50, 50],
    [100, 20],
    [100, 50],
    [200, 50],
    [50, 10],
    [20, 10],
    [100, 10],
  ];
  for (const [a, b] of combos) {
    const sum = a + b;
    if (sum >= total && sum <= total + 30) {
      const rendu = sum - total;
      options.push({
        label: `${a} CHF + ${b} CHF`,
        value: sum,
        notes: rendu > 0 ? `Rendu : ${rendu.toFixed(2)} CHF` : "Compte juste",
      });
    }
  }
  const seen = new Set<number>();
  return options
    .filter((o) => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    })
    .sort((a, b) => a.value - total - (b.value - total))
    .slice(0, 4);
}

export default function CheckoutPageClient({ restaurantId, accepting }: Props) {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<QualifiedAddress | null>(null);
  const [mode, setMode] = useState<FulfillmentMode>("delivery");
  const [hydrated, setHydrated] = useState(false);

  // Section 1 : logement (livraison)
  const [housingType, setHousingType] = useState<HousingType | null>(null);

  // Section 2 : adresse + apt fields (livraison)
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [entryCode1, setEntryCode1] = useState("");
  const [entryCode2, setEntryCode2] = useState("");
  const [floor, setFloor] = useState("");
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [doorbellName, setDoorbellName] = useState("");
  const [instructions, setInstructions] = useState("");

  // Heure (asap / précise)
  const [asap, setAsap] = useState(true);
  const [pickupTime, setPickupTime] = useState("");

  // Section paiement
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [cardTiming, setCardTiming] = useState<CardTiming | null>(null);
  const [cashBills, setCashBills] = useState<number>(0);

  // Coordonnées
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Promo
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

  const isPickup = mode === "pickup";

  // Init : cart + address + mode + prefill silencieux
  useEffect(() => {
    const c = readCart();
    const a = readAddress();
    const p = readPrefill();
    const m = readFulfillment() ?? (a ? "delivery" : "pickup");
    setCart(c);
    setAddress(a);
    setMode(m);
    setHydrated(true);

    if (c.length === 0) {
      router.replace("/menu");
      return;
    }
    // Livraison sans adresse qualifiée → qualification sur la home (étalon).
    if (m === "delivery" && !a) {
      router.replace("/?need_address=1");
      return;
    }

    setStreet(p.street ?? a?.address ?? "");
    setPostalCode(p.postalCode ?? a?.postal_code ?? "");
    setCity(p.city ?? a?.city ?? "");
    setHousingType(p.housingType ?? null);
    setEntryCode1(p.entryCode1 ?? "");
    setEntryCode2(p.entryCode2 ?? "");
    setFloor(p.floor ?? "");
    setApartmentNumber(p.apartmentNumber ?? "");
    setDoorbellName(p.doorbellName ?? "");
    setInstructions(p.instructions ?? "");
    setFirstName(p.firstName ?? "");
    setPhone(p.phone ?? "");
    setEmail(p.email ?? "");
  }, [router]);

  const subtotal = useMemo(() => cartSubtotal(cart), [cart]);
  const count = cartCount(cart);
  const deliveryFee = isPickup ? 0 : address?.delivery_fee ?? 0;
  const promoDiscount = promo?.discount_amount ?? 0;
  const minAmount = isPickup
    ? RIALTO_INFO.minOrderCHF
    : address?.min_order_amount ?? RIALTO_INFO.minOrderCHF;
  const missing = Math.max(0, minAmount - subtotal);
  const total = Math.max(0, subtotal + deliveryFee - promoDiscount);

  function handleModeChange(next: FulfillmentMode) {
    if (next === mode) return;
    if (next === "delivery" && !address) {
      writeFulfillment("delivery");
      router.push("/?need_address=1");
      return;
    }
    writeFulfillment(next);
    setMode(next);
  }

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
        body: JSON.stringify({ business_id: STAMPIFY_BUSINESS_ID, code, subtotal }),
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

  // Validation cumulative (selon le mode)
  const showRest = isPickup || housingType !== null;
  const housingValid = isPickup ? true : housingType !== null;
  const addressValid = isPickup ? true : street.trim().length >= 3;
  const timeValid = asap || pickupTime.trim().length >= 4;
  const paymentBaseValid = paymentMethod !== null;
  const paymentSubValid =
    paymentMethod === "card"
      ? cardTiming !== null
      : paymentMethod === "cash"
        ? cashBills > 0
        : paymentMethod === "twint"
          ? true
          : false;
  const contactValid = firstName.trim().length >= 2 && phone.trim().length >= 8;
  const amountValid = missing === 0;
  const canSubmit =
    housingValid &&
    addressValid &&
    timeValid &&
    paymentBaseValid &&
    paymentSubValid &&
    contactValid &&
    amountValid &&
    !loading &&
    accepting &&
    (isPickup || !!address);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    if (!isPickup && !address) return;
    setLoading(true);
    setError(null);
    try {
      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone) {
        setError("Numéro invalide. Format : +41 79… ou +33 6…");
        setLoading(false);
        return;
      }

      // Heure de retrait / livraison.
      let pickupISO: string | null = null;
      if (!asap && pickupTime) {
        const [h, m] = pickupTime.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        pickupISO = d.toISOString();
      } else if (isPickup) {
        // Retrait "dès que possible" : le backend EXIGE une heure → prépa + marge.
        const d = new Date(
          Date.now() + (RIALTO_INFO.prepTimeMinutes + PICKUP_ASAP_BUFFER_MIN) * 60_000,
        );
        pickupISO = d.toISOString();
      }

      writePrefill({
        housingType: housingType ?? undefined,
        street: street.trim(),
        postalCode: postalCode.trim(),
        city: city.trim(),
        entryCode1: entryCode1.trim() || undefined,
        entryCode2: entryCode2.trim() || undefined,
        floor: floor.trim() || undefined,
        apartmentNumber: apartmentNumber.trim() || undefined,
        doorbellName: doorbellName.trim() || undefined,
        instructions: instructions.trim() || undefined,
        firstName: firstName.trim(),
        phone: cleanPhone,
        email: email.trim() || undefined,
      });

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          customer_name: firstName.trim(),
          customer_phone: cleanPhone,
          customer_email: email.trim() || null,
          requested_pickup_time: pickupISO,
          fulfillment_type: mode,
          delivery_address: isPickup ? null : street.trim(),
          delivery_postal_code: isPickup
            ? null
            : postalCode.trim() || address?.postal_code || null,
          delivery_city: isPickup ? null : city.trim() || address?.city || null,
          delivery_zone_id: isPickup ? null : address?.zone_id ?? null,
          delivery_instructions: isPickup ? null : instructions.trim() || null,
          housing_type: isPickup ? null : housingType,
          entry_code_1: isPickup ? null : entryCode1.trim() || null,
          entry_code_2: isPickup ? null : entryCode2.trim() || null,
          floor: isPickup ? null : floor.trim() || null,
          apartment_number: isPickup ? null : apartmentNumber.trim() || null,
          doorbell_name: isPickup ? null : doorbellName.trim() || null,
          payment_method: paymentMethod,
          payment_card_timing: paymentMethod === "card" ? cardTiming : null,
          payment_cash_bills: paymentMethod === "cash" ? cashBills : null,
          notes: null,
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

  // Avant hydratation, ou redirection en cours : rien à afficher.
  if (!hydrated) return null;
  if (mode === "delivery" && !address) return null;
  if (cart.length === 0) return null;

  const cashOptions = getCashOptions(total);
  const etaLabel = isPickup
    ? `Prêt en ~${RIALTO_INFO.prepTimeMinutes} min`
    : `~${address?.estimated_delivery_minutes ?? 30} min`;
  const handoverLabel = isPickup ? "Au comptoir" : "Au livreur";

  return (
    <main className="min-h-screen bg-cream pb-28 md:pb-12">
      <header className="sticky top-0 z-30 border-b border-border bg-cream/95 backdrop-blur-lg">
        <div className="container-hero flex h-14 items-center justify-between gap-3 sm:h-16">
          <Link
            href="/menu"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink transition hover:text-rialto"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline">Retour au menu</span>
            <span className="sm:hidden">Menu</span>
          </Link>
          <span className="font-display text-sm font-semibold md:text-base">
            Finaliser la commande
          </span>
          <span className="w-[70px]" aria-hidden />
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="container-hero grid grid-cols-1 gap-5 py-5 lg:grid-cols-[1fr,380px] lg:gap-6 lg:py-6"
      >
        {/* ─── Colonne gauche ─────────────────────────────────── */}
        <div className="space-y-7">
          {/* Mode de commande */}
          <FulfillmentToggle
            value={mode}
            onChange={handleModeChange}
            size="sm"
            className="max-w-sm"
          />

          {/* Récap panier */}
          <div>
            <h2 className="mb-3 font-display text-base font-bold text-ink">
              Votre panier ({count} article{count > 1 ? "s" : ""})
            </h2>
            <div className="space-y-2">
              {cart.map((item) => (
                <CartLineRow
                  key={item.key}
                  item={item}
                  onIncr={() => updateQuantity(item.key, 1)}
                  onDecr={() => updateQuantity(item.key, -1)}
                />
              ))}
            </div>
            <UpsellPanel cart={cart} onAdd={addUpsellItem} />
          </div>

          {/* ── Mode-specific : retrait (pickup) ou logement+adresse (delivery) ── */}
          {isPickup ? (
            <Section title="Retrait au restaurant" step="1">
              <div className="rounded-2xl border border-border bg-rialto-50/60 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-rialto shadow-card">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 2C7.58 2 4 5.58 4 10c0 7 8 12 8 12s8-5 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-ink">{RIALTO_INFO.name}</p>
                    <p className="text-sm text-mute">{RIALTO_INFO.address}</p>
                    <p className="mt-1 text-xs text-mute">
                      Ouvert · {RIALTO_INFO.openingHoursShort}
                    </p>
                  </div>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${RIALTO_INFO.name} ${RIALTO_INFO.address}`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 self-center rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-rialto hover:text-rialto"
                  >
                    Itinéraire
                  </a>
                </div>
              </div>
              <div className="mt-4">
                <p className="mb-2 text-sm font-semibold text-ink">
                  Quand venez-vous chercher ?
                </p>
                <TimeChoice
                  asap={asap}
                  setAsap={setAsap}
                  pickupTime={pickupTime}
                  setPickupTime={setPickupTime}
                  etaLabel={etaLabel}
                />
              </div>
            </Section>
          ) : (
            <>
              <Section title="Type de logement" step="1">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setHousingType("house")}
                    className={selectionCard(housingType === "house")}
                  >
                    <div className="mb-2 text-3xl">🏠</div>
                    <div className="font-display font-bold text-ink">Maison</div>
                    <div className="mt-0.5 text-xs text-mute">
                      Maison individuelle, villa
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHousingType("apartment")}
                    className={selectionCard(housingType === "apartment")}
                  >
                    <div className="mb-2 text-3xl">🏢</div>
                    <div className="font-display font-bold text-ink">Appartement</div>
                    <div className="mt-0.5 text-xs text-mute">Immeuble, résidence</div>
                  </button>
                </div>
              </Section>

              {housingType !== null && (
                <Section title="Adresse de livraison" step="2">
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="Rue et numéro (ex : Av. de Béthusy 29)"
                      required
                      className="input"
                    />
                    <div className="grid grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={postalCode}
                        onChange={(e) => setPostalCode(e.target.value)}
                        placeholder="NPA"
                        className="input col-span-1"
                      />
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Ville"
                        className="input col-span-2"
                      />
                    </div>

                    {housingType === "apartment" && (
                      <div className="space-y-3 rounded-2xl border border-saffron/30 bg-rialto-50/50 p-4">
                        <p className="text-xs font-bold uppercase tracking-wide text-rialto-dark">
                          🔑 Pour que le livreur trouve facilement
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={entryCode1}
                            onChange={(e) => setEntryCode1(e.target.value)}
                            placeholder="Code entrée 1"
                            className="input-compact"
                          />
                          <input
                            type="text"
                            value={entryCode2}
                            onChange={(e) => setEntryCode2(e.target.value)}
                            placeholder="Code entrée 2 (si besoin)"
                            className="input-compact"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={floor}
                            onChange={(e) => setFloor(e.target.value)}
                            placeholder="Étage (ex : 3, RDC)"
                            className="input-compact"
                          />
                          <input
                            type="text"
                            value={apartmentNumber}
                            onChange={(e) => setApartmentNumber(e.target.value)}
                            placeholder="N° appartement / porte"
                            className="input-compact"
                          />
                        </div>
                        <input
                          type="text"
                          value={doorbellName}
                          onChange={(e) => setDoorbellName(e.target.value)}
                          placeholder="Nom sur la sonnette / interphone"
                          className="input-compact"
                        />
                        <textarea
                          value={instructions}
                          onChange={(e) => setInstructions(e.target.value)}
                          placeholder="Autres infos (ascenseur, sonnette HS, etc.)"
                          rows={2}
                          className="input-compact resize-none"
                        />
                      </div>
                    )}

                    {housingType === "house" && (
                      <textarea
                        value={instructions}
                        onChange={(e) => setInstructions(e.target.value)}
                        placeholder="Instructions livreur (optionnel) — portail, chien, sonnette…"
                        rows={2}
                        className="input resize-none"
                      />
                    )}

                    <div className="pt-1">
                      <TimeChoice
                        asap={asap}
                        setAsap={setAsap}
                        pickupTime={pickupTime}
                        setPickupTime={setPickupTime}
                        etaLabel={etaLabel}
                      />
                    </div>
                  </div>
                </Section>
              )}
            </>
          )}

          {/* ── Paiement (les deux modes) ── */}
          {showRest && (
            <Section title="Mode de paiement" step={isPickup ? "2" : "3"}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("card");
                    setCashBills(0);
                  }}
                  className={selectionCard(paymentMethod === "card")}
                >
                  <div className="mb-2 text-2xl">💳</div>
                  <div className="font-display font-bold text-ink">Carte</div>
                  <div className="mt-0.5 text-xs text-mute">
                    {handoverLabel} ou à distance
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("cash");
                    setCardTiming(null);
                  }}
                  className={selectionCard(paymentMethod === "cash")}
                >
                  <div className="mb-2 text-2xl">💵</div>
                  <div className="font-display font-bold text-ink">Espèces</div>
                  <div className="mt-0.5 text-xs text-mute">
                    {isPickup ? "Préparez l'appoint" : "Le livreur prépare la monnaie"}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("twint");
                    setCardTiming(null);
                    setCashBills(0);
                  }}
                  className={selectionCard(paymentMethod === "twint")}
                >
                  <div className="mb-2 text-2xl">📱</div>
                  <div className="font-display font-bold text-ink">Twint</div>
                  <div className="mt-0.5 text-xs text-mute">
                    {handoverLabel}, en 1 scan
                  </div>
                </button>
              </div>

              {paymentMethod === "card" && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-ink/80">
                    Quand voulez-vous payer ?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCardTiming("on_delivery")}
                      className={selectionCard(cardTiming === "on_delivery")}
                    >
                      <div className="font-display font-bold text-ink">
                        {handoverLabel}
                      </div>
                      <div className="mt-0.5 text-xs text-mute">
                        {isPickup ? "Paiement au retrait" : "Paiement à la livraison"}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardTiming("remote")}
                      className={selectionCard(cardTiming === "remote")}
                    >
                      <div className="font-display font-bold text-ink">À distance</div>
                      <div className="mt-0.5 text-xs text-mute">Lien envoyé par tél</div>
                    </button>
                  </div>
                  {cardTiming === "remote" && (
                    <div className="mt-3 rounded-xl border border-saffron/30 bg-saffron/10 p-3 text-sm text-rialto-dark">
                      💬 Le restaurant vous appellera au{" "}
                      <strong>{PHONE_OF_MEHMET}</strong> pour vous envoyer le lien de
                      paiement par WhatsApp ou SMS dans les 5 minutes.
                    </div>
                  )}
                  {cardTiming === "on_delivery" && (
                    <div className="mt-3 rounded-xl border border-border bg-cream p-3 text-sm text-ink/80">
                      ✅{" "}
                      {isPickup
                        ? "Réglez directement par carte au comptoir, au retrait."
                        : "Le livreur arrivera avec le terminal de paiement."}
                    </div>
                  )}
                </div>
              )}

              {paymentMethod === "cash" && (
                <div className="mt-4 space-y-3">
                  <p className="text-sm font-medium text-ink/80">
                    Avec quel(s) billet(s) allez-vous payer ?
                    <span className="mt-1 block text-xs text-mute">
                      {isPickup
                        ? "Pour préparer la monnaie au comptoir"
                        : "Pour que le livreur prépare la bonne monnaie"}
                    </span>
                  </p>
                  {cashOptions.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {cashOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCashBills(opt.value)}
                          className={selectionCard(cashBills === opt.value)
                            .replace("p-4", "p-3")}
                        >
                          <div className="font-display text-sm font-bold text-ink">
                            {opt.label}
                          </div>
                          <div className="mt-0.5 text-xs text-mute">{opt.notes}</div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="1"
                      min={total}
                      placeholder={`Montant approximatif (≥ ${total.toFixed(2)} CHF)`}
                      onChange={(e) => setCashBills(parseFloat(e.target.value) || 0)}
                      className="input"
                    />
                  )}
                </div>
              )}

              {paymentMethod === "twint" && (
                <div className="mt-4 rounded-xl border border-border bg-cream p-4 text-sm text-ink/80">
                  📱{" "}
                  {isPickup
                    ? "Le QR code Twint vous sera présenté au comptoir, au retrait."
                    : "Le livreur vous montrera le QR code Twint à l'arrivée. Vous payerez sur place."}
                </div>
              )}
            </Section>
          )}

          {/* ── Coordonnées ── */}
          {showRest && (
            <Section title="Vos coordonnées" step={isPickup ? "3" : "4"}>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    required
                    autoComplete="given-name"
                    className="input"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+41 79 123 45 67"
                    required
                    autoComplete="tel"
                    className="input"
                  />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optionnel — pour la confirmation)"
                  autoComplete="email"
                  className="input"
                />
              </div>
            </Section>
          )}

          {/* ── Promo ── */}
          {showRest && (
            <Section title="Code promo" step="" optional>
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
                      className="btn-ghost px-5"
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
          )}
        </div>

        {/* ─── Colonne droite : récap + CTA ────────────────── */}
        <aside className="lg:sticky lg:top-8 lg:h-fit">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-card">
            <h3 className="font-display text-xl font-bold">Récapitulatif</h3>
            <dl className="mt-5 space-y-2 text-sm">
              <Row
                label={`Sous-total (${count} article${count > 1 ? "s" : ""})`}
                value={formatCHF(subtotal)}
              />
              {!isPickup && (
                <Row
                  label="Frais de livraison"
                  value={deliveryFee > 0 ? formatCHF(deliveryFee) : "Offerts"}
                />
              )}
              {promo && promoDiscount > 0 && (
                <Row
                  label={`Code ${promo.code}`}
                  value={`−${formatCHF(promoDiscount)}`}
                  accent
                />
              )}
              <div className="border-t border-border pt-3">
                <Row label="Total" value={formatCHF(total)} emphasis />
              </div>
            </dl>

            {missing > 0 && (
              <div className="mt-4 rounded-xl bg-rialto/10 p-3 text-xs font-medium text-rialto">
                Ajoutez {formatCHF(missing)} pour atteindre le minimum (
                {formatCHF(minAmount)}).
              </div>
            )}
            {!accepting && (
              <div className="mt-4 rounded-xl bg-ink/5 p-3 text-xs font-medium text-ink">
                Nous ne prenons plus de commandes pour le moment.
              </div>
            )}
            {error && (
              <div className="mt-4 rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-primary-lg mt-6 w-full justify-center"
            >
              {loading ? "Envoi…" : `Confirmer · ${formatCHF(total)}`}
            </button>

            <p className="mt-3 text-center text-xs text-mute">
              {isPickup
                ? `Retrait · ${RIALTO_INFO.address.split(",")[0]} · ${etaLabel}`
                : `Livré en ${etaLabel}`}
            </p>
          </div>
        </aside>

        {/* Sticky bottom CTA mobile/iPad portrait */}
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-white/95 p-3 backdrop-blur-lg md:hidden">
          <button
            type="submit"
            disabled={!canSubmit}
            className="btn-primary-lg w-full justify-center"
          >
            {loading ? "Envoi…" : `Confirmer · ${formatCHF(total)}`}
          </button>
        </div>
      </form>
    </main>
  );
}

/* ═════════════════════════════════════════════════════════════════════ */

function TimeChoice({
  asap,
  setAsap,
  pickupTime,
  setPickupTime,
  etaLabel,
}: {
  asap: boolean;
  setAsap: (v: boolean) => void;
  pickupTime: string;
  setPickupTime: (v: string) => void;
  etaLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setAsap(true)}
          className={selectionCard(asap).replace("p-4", "p-3")}
        >
          <div className="font-display text-sm font-bold text-ink">Dès que possible</div>
          <div className="mt-0.5 text-xs text-mute">{etaLabel}</div>
        </button>
        <button
          type="button"
          onClick={() => setAsap(false)}
          className={selectionCard(!asap).replace("p-4", "p-3")}
        >
          <div className="font-display text-sm font-bold text-ink">Heure précise</div>
          <div className="mt-0.5 text-xs text-mute">Choisir un créneau</div>
        </button>
      </div>
      {!asap && (
        <input
          type="time"
          value={pickupTime}
          onChange={(e) => setPickupTime(e.target.value)}
          step={900}
          required
          className="input"
        />
      )}
    </div>
  );
}

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
        {step && (
          <span className="tabular font-display text-xs font-semibold text-rialto">
            {step.padStart(2, "0")}
          </span>
        )}
        <h2 className="font-display text-xl font-bold md:text-2xl">
          {title}
          {optional && (
            <span className="ml-2 text-xs font-normal text-mute">(optionnel)</span>
          )}
        </h2>
      </div>
      {children}
    </section>
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
      <dd className={`tabular ${emphasis ? "font-display font-bold" : ""}`}>{value}</dd>
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
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-card">
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
        <Image src={image} alt="" fill sizes="56px" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm font-semibold text-ink">
          {item.name}
        </div>
        {item.options.length > 0 && (
          <div className="mt-0.5 truncate text-xs text-mute">
            {item.options.map((o) => o.name).join(" · ")}
          </div>
        )}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-cream px-2 py-0.5">
            <button
              type="button"
              onClick={onDecr}
              className="flex h-6 w-6 items-center justify-center text-ink transition hover:text-rialto"
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
              className="flex h-6 w-6 items-center justify-center text-ink transition hover:text-rialto"
              aria-label="Augmenter"
            >
              +
            </button>
          </div>
          <span className="tabular ml-auto font-display text-sm font-semibold text-rialto-dark">
            {formatCHF(item.subtotal)}
          </span>
        </div>
      </div>
    </div>
  );
}
