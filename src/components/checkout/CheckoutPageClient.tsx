"use client";

/**
 * Page /checkout — Phase 1 refonte (logement + paiement).
 *
 * 4 sections successives :
 *   1. Logement (maison / appartement)
 *   2. Adresse de livraison (champs adaptatifs)
 *   3. Mode de paiement (carte / espèces / twint) + sous-options
 *   4. Coordonnées (prénom + téléphone + email optionnel)
 *
 * Préremplissage silencieux via localStorage RIALTO:CHECKOUT_PREFILL:V1.
 * Numéro WhatsApp Mehmet en placeholder — Augustin remplace.
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

// TODO: numéro Mehmet — Augustin remplace ce placeholder
const PHONE_OF_MEHMET = "+41 XX XXX XX XX";

const PREFILL_KEY = "RIALTO:CHECKOUT_PREFILL:V1";

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

/* ─── Calcul des billets cash (CHF) ─────────────────────────────────── */
type CashOption = { label: string; value: number; notes: string };

function getCashOptions(total: number): CashOption[] {
  const billets = [10, 20, 50, 100, 200];
  const options: CashOption[] = [];

  // 1 billet seul
  for (const b of billets) {
    if (b >= total && b <= total + 100) {
      const rendu = b - total;
      options.push({
        label: `1 billet de ${b} CHF`,
        value: b,
        notes:
          rendu > 0 ? `Rendu : ${rendu.toFixed(2)} CHF` : "Compte juste",
      });
    }
  }
  // 2 billets identiques
  for (const b of billets) {
    const sum = b * 2;
    if (sum >= total && sum <= total + 50) {
      const rendu = sum - total;
      options.push({
        label: `2 billets de ${b} CHF`,
        value: sum,
        notes:
          rendu > 0 ? `Rendu : ${rendu.toFixed(2)} CHF` : "Compte juste",
      });
    }
  }
  // Combinaisons logiques
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
        notes:
          rendu > 0 ? `Rendu : ${rendu.toFixed(2)} CHF` : "Compte juste",
      });
    }
  }
  // Dédupliquer + tri par rendu croissant
  const seen = new Set<number>();
  return options
    .filter((o) => {
      if (seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    })
    .sort((a, b) => a.value - b.value - (a.value - total - (b.value - total)))
    .sort((a, b) => a.value - total - (b.value - total))
    .slice(0, 4);
}

export default function CheckoutPageClient({
  restaurantId,
  accepting,
}: Props) {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<QualifiedAddress | null>(null);

  // Section 1 : logement
  const [housingType, setHousingType] = useState<HousingType | null>(null);

  // Section 2 : adresse + apt fields
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [entryCode1, setEntryCode1] = useState("");
  const [entryCode2, setEntryCode2] = useState("");
  const [floor, setFloor] = useState("");
  const [apartmentNumber, setApartmentNumber] = useState("");
  const [doorbellName, setDoorbellName] = useState("");
  const [instructions, setInstructions] = useState("");

  // Heure (asap / précise) — gardée du checkout existant car utile à Mehmet
  const [asap, setAsap] = useState(true);
  const [pickupTime, setPickupTime] = useState("");

  // Section 3 : paiement
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(
    null,
  );
  const [cardTiming, setCardTiming] = useState<CardTiming | null>(null);
  const [cashBills, setCashBills] = useState<number>(0);

  // Section 4 : coordonnées
  const [firstName, setFirstName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Promo (kept)
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

  // Init : cart + address + prefill silencieux
  useEffect(() => {
    const c = readCart();
    const a = readAddress();
    const p = readPrefill();
    setCart(c);
    setAddress(a);
    if (!a) {
      router.replace("/?need_address=1");
      return;
    }
    if (c.length === 0) {
      router.replace("/menu");
      return;
    }
    // Prérempli adresse depuis QualifiedAddress homepage si rien en prefill
    setStreet(p.street ?? a.address ?? "");
    setPostalCode(p.postalCode ?? a.postal_code ?? "");
    setCity(p.city ?? a.city ?? "");
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

  async function addUpsellItem(menuItemId: string) {
    try {
      const res = await fetch(
        `${STAMPIFY_BASE}/api/rialto/menu-item/${menuItemId}`,
      );
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

  // Validation cumulative
  const housingValid = housingType !== null;
  const addressValid = street.trim().length >= 3;
  const paymentBaseValid = paymentMethod !== null;
  const paymentSubValid =
    paymentMethod === "card"
      ? cardTiming !== null
      : paymentMethod === "cash"
        ? cashBills > 0
        : paymentMethod === "twint"
          ? true
          : false;
  const contactValid =
    firstName.trim().length >= 2 && phone.trim().length >= 8;
  const amountValid = missing === 0;
  const canSubmit =
    housingValid &&
    addressValid &&
    paymentBaseValid &&
    paymentSubValid &&
    contactValid &&
    amountValid &&
    !loading &&
    !!address &&
    accepting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !address) return;
    setLoading(true);
    setError(null);
    try {
      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone) {
        setError("Numéro invalide. Format : +41 79… ou +33 6…");
        setLoading(false);
        return;
      }

      let pickupISO: string | null = null;
      if (!asap && pickupTime) {
        const [h, m] = pickupTime.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m, 0, 0);
        pickupISO = d.toISOString();
      }

      // Persist prefill silencieusement avant POST
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
          fulfillment_type: "delivery",
          delivery_address: street.trim(),
          delivery_postal_code:
            postalCode.trim() || address.postal_code,
          delivery_city: city.trim() || address.city,
          delivery_zone_id: address.zone_id,
          delivery_instructions: instructions.trim() || null,
          // Phase 1 checkout refonte
          housing_type: housingType,
          entry_code_1: entryCode1.trim() || null,
          entry_code_2: entryCode2.trim() || null,
          floor: floor.trim() || null,
          apartment_number: apartmentNumber.trim() || null,
          doorbell_name: doorbellName.trim() || null,
          payment_method: paymentMethod,
          payment_card_timing:
            paymentMethod === "card" ? cardTiming : null,
          payment_cash_bills:
            paymentMethod === "cash" ? cashBills : null,
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

  if (!address) return null;

  const cashOptions = getCashOptions(total);

  return (
    <main className="min-h-screen bg-cream pb-28 md:pb-12">
      <header className="border-b border-border bg-cream/95 backdrop-blur-lg">
        <div className="container-hero flex h-14 items-center justify-between gap-3 sm:h-16">
          <Link
            href="/menu"
            className="flex items-center gap-2 text-sm font-medium text-ink hover:text-rialto"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            >
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
        className="container-hero grid grid-cols-1 gap-5 py-5 lg:grid-cols-[1fr,380px] lg:gap-6 lg:py-6"
      >
        {/* ─── Colonne gauche ─────────────────────────────────── */}
        <div className="space-y-8">
          {/* Récap panier (ancrage visuel, pas une section numérotée) */}
          <div>
            <h2 className="font-display text-base font-bold text-ink mb-3">
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

          {/* ───────────── SECTION 1 — TYPE DE LOGEMENT ───────────── */}
          <Section title="Type de logement" step="1">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setHousingType("house")}
                className={`p-5 rounded-2xl border-2 transition-all text-left ${
                  housingType === "house"
                    ? "border-[#C73E1D] bg-[#F9F1E4] shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="text-3xl mb-2">🏠</div>
                <div className="font-bold text-[#9A2E14]">Maison</div>
                <div className="text-xs text-gray-500 mt-1">
                  Maison individuelle, villa
                </div>
              </button>
              <button
                type="button"
                onClick={() => setHousingType("apartment")}
                className={`p-5 rounded-2xl border-2 transition-all text-left ${
                  housingType === "apartment"
                    ? "border-[#C73E1D] bg-[#F9F1E4] shadow-md"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="text-3xl mb-2">🏢</div>
                <div className="font-bold text-[#9A2E14]">Appartement</div>
                <div className="text-xs text-gray-500 mt-1">
                  Immeuble, résidence
                </div>
              </button>
            </div>
          </Section>

          {/* ───────────── SECTION 2 — ADRESSE ─────────────────── */}
          {housingType !== null && (
            <Section title="Adresse de livraison" step="2">
              <div className="space-y-3 transition-all duration-200">
                <input
                  type="text"
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  placeholder="Rue et numéro (ex: Av. de Béthusy 29)"
                  required
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                />
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="NPA"
                    className="col-span-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ville"
                    className="col-span-2 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                </div>

                {housingType === "apartment" && (
                  <div className="space-y-3 bg-[#F9F1E4]/40 p-4 rounded-2xl border border-[#E6A12C]/20">
                    <p className="text-xs font-bold text-[#9A2E14] uppercase tracking-wide">
                      🔑 Pour que le livreur trouve facilement
                    </p>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={entryCode1}
                        onChange={(e) => setEntryCode1(e.target.value)}
                        placeholder="Code entrée 1"
                        className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                      />
                      <input
                        type="text"
                        value={entryCode2}
                        onChange={(e) => setEntryCode2(e.target.value)}
                        placeholder="Code entrée 2 (si nécessaire)"
                        className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={floor}
                        onChange={(e) => setFloor(e.target.value)}
                        placeholder="Étage (ex: 3, RDC)"
                        className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                      />
                      <input
                        type="text"
                        value={apartmentNumber}
                        onChange={(e) => setApartmentNumber(e.target.value)}
                        placeholder="N° appartement / Porte"
                        className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                      />
                    </div>

                    <input
                      type="text"
                      value={doorbellName}
                      onChange={(e) => setDoorbellName(e.target.value)}
                      placeholder="Nom sur la sonnette / interphone"
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                    />

                    <textarea
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="Autres infos (ascenseur, sonnette HS, etc.)"
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-sm resize-none"
                    />
                  </div>
                )}

                {housingType === "house" && (
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Instructions livreur (optionnel) — portail, chien, sonnette, etc."
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-sm resize-none"
                  />
                )}

                {/* Heure livraison — utile à Mehmet */}
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setAsap(true)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      asap
                        ? "border-[#C73E1D] bg-[#F9F1E4]"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="text-sm font-bold">Dès que possible</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      ~{address.estimated_delivery_minutes} min
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsap(false)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      !asap
                        ? "border-[#C73E1D] bg-[#F9F1E4]"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="text-sm font-bold">Heure précise</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Choisir un créneau
                    </div>
                  </button>
                </div>
                {!asap && (
                  <input
                    type="time"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                    step={900}
                    required
                    className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                )}
              </div>
            </Section>
          )}

          {/* ───────────── SECTION 3 — PAIEMENT ────────────────── */}
          {housingType !== null && (
            <Section title="Mode de paiement" step="3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("card");
                    setCashBills(0);
                  }}
                  className={`p-5 rounded-2xl border-2 transition-all text-left ${
                    paymentMethod === "card"
                      ? "border-[#C73E1D] bg-[#F9F1E4] shadow-md"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-2xl mb-2">💳</div>
                  <div className="font-bold text-[#9A2E14]">Carte</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Au livreur ou à distance
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("cash");
                    setCardTiming(null);
                  }}
                  className={`p-5 rounded-2xl border-2 transition-all text-left ${
                    paymentMethod === "cash"
                      ? "border-[#C73E1D] bg-[#F9F1E4] shadow-md"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-2xl mb-2">💵</div>
                  <div className="font-bold text-[#9A2E14]">Espèces</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Le livreur prépare la monnaie
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("twint");
                    setCardTiming(null);
                    setCashBills(0);
                  }}
                  className={`p-5 rounded-2xl border-2 transition-all text-left ${
                    paymentMethod === "twint"
                      ? "border-[#C73E1D] bg-[#F9F1E4] shadow-md"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="text-2xl mb-2">📱</div>
                  <div className="font-bold text-[#9A2E14]">Twint</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Au livreur, en 1 scan
                  </div>
                </button>
              </div>

              {/* Sous-options carte */}
              {paymentMethod === "card" && (
                <div className="mt-4 space-y-2 transition-all duration-200">
                  <p className="text-sm font-medium text-gray-700">
                    Quand voulez-vous payer ?
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setCardTiming("on_delivery")}
                      className={`p-4 rounded-xl border-2 transition-all text-sm text-left ${
                        cardTiming === "on_delivery"
                          ? "border-[#C73E1D] bg-[#F9F1E4]"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="font-bold">Au livreur</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Paiement à la livraison
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setCardTiming("remote")}
                      className={`p-4 rounded-xl border-2 transition-all text-sm text-left ${
                        cardTiming === "remote"
                          ? "border-[#C73E1D] bg-[#F9F1E4]"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      <div className="font-bold">À distance</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Lien envoyé par tél
                      </div>
                    </button>
                  </div>
                  {cardTiming === "remote" && (
                    <div className="mt-3 p-3 rounded-xl bg-[#E6A12C]/10 border border-[#E6A12C]/30 text-sm text-[#9A2E14]">
                      💬 Mehmet vous appellera au{" "}
                      <strong>{PHONE_OF_MEHMET}</strong> pour vous envoyer
                      le lien de paiement par WhatsApp ou SMS dans les 5
                      minutes.
                    </div>
                  )}
                  {cardTiming === "on_delivery" && (
                    <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                      ✅ Le livreur arrivera avec le terminal de paiement.
                    </div>
                  )}
                </div>
              )}

              {/* Sous-options espèces */}
              {paymentMethod === "cash" && (
                <div className="mt-4 space-y-3 transition-all duration-200">
                  <p className="text-sm font-medium text-gray-700">
                    Avec quel(s) billet(s) allez-vous payer ?
                    <span className="block text-xs text-gray-500 mt-1">
                      Pour que le livreur prépare la bonne monnaie
                    </span>
                  </p>
                  {cashOptions.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {cashOptions.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setCashBills(opt.value)}
                          className={`p-3 rounded-xl border-2 text-left transition-all ${
                            cashBills === opt.value
                              ? "border-[#C73E1D] bg-[#F9F1E4]"
                              : "border-gray-200 bg-white"
                          }`}
                        >
                          <div className="font-bold text-sm text-[#9A2E14]">
                            {opt.label}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {opt.notes}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="1"
                      min={total}
                      placeholder={`Montant approximatif (≥ ${total.toFixed(
                        2,
                      )} CHF)`}
                      onChange={(e) =>
                        setCashBills(parseFloat(e.target.value) || 0)
                      }
                      className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                    />
                  )}
                </div>
              )}

              {/* Twint message */}
              {paymentMethod === "twint" && (
                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 transition-all duration-200">
                  📱 Le livreur vous montrera le QR code Twint à l&apos;arrivée.
                  Vous payerez directement sur place.
                </div>
              )}
            </Section>
          )}

          {/* ───────────── SECTION 4 — COORDONNÉES ─────────────── */}
          {housingType !== null && (
            <Section title="Vos coordonnées" step="4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    required
                    autoComplete="given-name"
                    className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+41 XX XXX XX XX"
                    required
                    autoComplete="tel"
                    className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email (optionnel — pour la confirmation)"
                  autoComplete="email"
                  className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                />
              </div>
            </Section>
          )}

          {/* Promo (optionnel, conservé) */}
          {housingType !== null && (
            <Section title="Code promo" step="" optional>
              {promo ? (
                <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div>
                    <div className="text-sm font-semibold text-emerald-800">
                      ✓ {promo.code}
                    </div>
                    <div className="text-xs text-emerald-700">
                      {promo.message}
                    </div>
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
                      className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={applyPromo}
                      disabled={!promoInput.trim() || promoChecking}
                      className="px-4 py-3 rounded-xl border-2 border-gray-200 text-sm font-semibold text-ink hover:border-[#C73E1D] disabled:opacity-50"
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
              <Row label="Frais de livraison" value={formatCHF(deliveryFee)} />
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
              className="w-full bg-[#C73E1D] hover:bg-[#9A2E14] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-lg shadow-lg transition-colors mt-6"
            >
              {loading
                ? "Envoi…"
                : `Confirmer ma commande — ${total.toFixed(2)} CHF`}
            </button>

            <p className="mt-3 text-center text-xs text-mute">
              Livré en ~{address.estimated_delivery_minutes} min
            </p>
          </div>
        </aside>

        {/* Sticky bottom CTA pour mobile/iPad portrait */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 p-3 md:hidden">
          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-[#C73E1D] hover:bg-[#9A2E14] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-base shadow-lg transition-colors"
          >
            {loading
              ? "Envoi…"
              : `Confirmer — ${total.toFixed(2)} CHF`}
          </button>
        </div>
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
        {step && (
          <span className="tabular font-display text-xs font-semibold text-rialto">
            {step.padStart(2, "0")}
          </span>
        )}
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
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
        <Image src={image} alt="" fill sizes="56px" className="object-cover" />
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
