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

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { CartItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import {
  addLinesToCart,
  cartCount,
  cartLineKey,
  cartSubtotal,
  clearCart,
  readAddress,
  readCart,
  writeAddress,
  writeCart,
  type QualifiedAddress,
} from "@/lib/clientStore";
import { track } from "@/lib/tracking";
import { RIALTO_INFO, matchDishImage } from "@/lib/rialto-data";
import UpsellPanel from "./UpsellPanel";
import { effectiveDeliveryFee } from "@/lib/delivery/rule";
import { useEtaRange } from "@/lib/eta/useEtaRange";
import { useFreeDeliveryRule } from "@/lib/delivery/useFreeDeliveryRule";
import { getFreeDeliveryMilestone } from "@/lib/delivery/milestones";
import { readAttribution } from "@/lib/attribution";

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
  // Petit lot checkout (29.07.2026, relevés relecteur Lot E) : dernier
  // sous-total pour lequel la remise a été validée (évite les re-fetchs en
  // boucle), et erreur de zone quand le CP édité n'est pas desservi.
  const lastValidatedSubtotal = useRef<number | null>(null);
  const [cpZoneError, setCpZoneError] = useState<string | null>(null);
  // Miroirs « dernière valeur » de street/city pour les callbacks async de
  // re-qualification (lire l'état frais sans mettre ces champs en deps —
  // sinon chaque frappe relancerait le debounce du CP).
  const streetRef = useRef("");
  const cityRef = useRef("");
  streetRef.current = street;
  cityRef.current = city;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lot D : begin_checkout UNE seule fois par arrivée sur la page (le ref
  // survit aux re-renders ; en dev, StrictMode double-monte les effects).
  const beganCheckout = useRef(false);

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
    // Rue : le prefill (dernière commande) est le plus précis. CP/ville :
    // l'adresse QUALIFIÉE dans CETTE session l'emporte sur le prefill — la
    // priorité inverse déclenchait au montage une re-qualification muette
    // vers la zone de la commande précédente (majeur relecteur 31.07.2026).
    setStreet(p.street ?? a.address ?? "");
    setPostalCode(a.postal_code ?? p.postalCode ?? "");
    setCity(a.city ?? p.city ?? "");
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
  const zoneFee = address?.delivery_fee ?? 0;
  // LS2 : fee EFFECTIF via la MÊME fonction pure que le serveur — le
  // delivery_fee figé dans localStorage à la qualification d'adresse ne
  // sait rien du seuil « livraison offerte ». Tant que la règle charge
  // (fdRule null), on affiche le fee de zone : jamais une gratuité
  // inventée qui serait reprise au POST.
  const fdRule = useFreeDeliveryRule();
  // Moteur de statuts (08.08.2026) : fourchette ETA VIVANTE (même moteur
  // que la page de suivi). Le figé de zone n'est plus qu'un repli réseau.
  const etaLive = useEtaRange(address?.postal_code);
  const deliveryFee = fdRule
    ? effectiveDeliveryFee(subtotal, zoneFee, fdRule)
    : zoneFee;
  const freeDelivery = zoneFee > 0 && deliveryFee === 0;
  const fdMilestone = getFreeDeliveryMilestone(subtotal, fdRule);
  const promoDiscount = promo?.discount_amount ?? 0;
  const minAmount = address?.min_order_amount ?? RIALTO_INFO.minOrderCHF;
  const missing = Math.max(0, minAmount - subtotal);
  const total = Math.max(0, subtotal + deliveryFee - promoDiscount);

  // Lot D → LS2 : begin_checkout à l'ENTRÉE du checkout, une seule fois
  // (ref), avec le fee EFFECTIF — le tir attend que la règle « livraison
  // offerte » soit connue (fdRule non null). La règle arrive vite (CDN
  // 60 s) et retombe sur « désactivée » en cas d'erreur réseau : le tir
  // est différé de quelques centaines de ms, jamais perdu. Le code promo
  // se saisit plus bas dans ce même formulaire, donc pas encore connu :
  // c'est l'état du panier à l'entrée, sémantique GA4 normale.
  useEffect(() => {
    if (beganCheckout.current) return;
    if (!fdRule || !address || cart.length === 0) return;
    beganCheckout.current = true;
    track.beginCheckout({
      value: subtotal + deliveryFee,
      items: cart.map((it) => ({
        id: it.menu_item_id,
        name: it.name,
        price: it.unit_price,
        quantity: it.quantity,
        category: it.category ?? undefined,
      })),
    });
  }, [fdRule, address, cart, subtotal, deliveryFee]);

  // Re-validation du code promo à CHAQUE changement de sous-total (relevé
  // relecteur Lot E) : la remise % est recalculée par le serveur sur le
  // sous-total du moment — sans ce rejeu, un upsell ou un +/- après la
  // saisie du code faisait diverger l'écran du montant réellement facturé.
  useEffect(() => {
    if (!promo || subtotal <= 0) return;
    if (lastValidatedSubtotal.current === subtotal) return;
    const code = promo.code;
    // AbortController : clearTimeout n'annule QUE le timer, jamais un fetch
    // déjà parti — une réponse périmée (panier re-modifié pendant le vol)
    // pouvait retirer une remise redevenue valide, définitivement
    // (majeur relecteur 31.07.2026).
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/promo-codes/validate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            business_id: STAMPIFY_BUSINESS_ID,
            code,
            subtotal,
          }),
          signal: controller.signal,
        });
        const body = (await res.json()) as {
          valid: boolean;
          error?: string;
          discount_amount?: number;
          message?: string;
        };
        lastValidatedSubtotal.current = subtotal;
        if (!body.valid) {
          // Le panier modifié ne satisfait plus le code (ex. repassé sous
          // son minimum) : on retire la remise et on le DIT.
          setPromo(null);
          setPromoError(
            body.error
              ? `Code ${code} retiré : ${body.error}`
              : `Le code ${code} ne s'applique plus à ce panier.`,
          );
        } else {
          setPromo((p) =>
            p && p.code === code
              ? {
                  ...p,
                  discount_amount: body.discount_amount ?? 0,
                  message: body.message ?? p.message,
                }
              : p,
          );
        }
      } catch {
        /* réseau ou abort : on garde l'ancienne remise — le serveur reste
           l'autorité au POST, et un 400 promo y bloque la commande */
      }
    }, 400);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [subtotal, promo]);

  // Re-qualification de la zone quand le CP change (relevé relecteur
  // Lot E) : l'adresse qualifiée en page d'accueil fige frais/minimum —
  // un CP édité ici vers une autre zone faisait payer des frais différents
  // de ceux affichés. On relit la zone, on met à jour frais/minimum/ville
  // (récap, paliers et begin_checkout suivent), on bloque si non desservie.
  useEffect(() => {
    if (!address) return;
    const pc = postalCode.trim();
    if (!/^\d{4}$/.test(pc) || pc === address.postal_code) {
      setCpZoneError(null);
      return;
    }
    // Même AbortController que l'effet promo : sans lui, des réponses
    // désordonnées laissaient un cpZoneError collé sur un CP corrigé.
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/delivery-zones/check?restaurant_id=${encodeURIComponent(
            restaurantId,
          )}&postal_code=${encodeURIComponent(pc)}`,
          { signal: controller.signal },
        );
        if (!res.ok) {
          // Erreur serveur ≠ zone non desservie : ne JAMAIS laisser un
          // blocage collé sur cette base (le POST re-vérifiera).
          setCpZoneError(null);
          return;
        }
        const body = (await res.json()) as {
          covered: boolean;
          zone?: {
            id: string;
            city: string | null;
            delivery_fee: number | string;
            min_order_amount: number | string;
            estimated_delivery_minutes: number | null;
          };
        };
        if (!body.covered || !body.zone) {
          setCpZoneError(
            `Nous ne livrons pas au ${pc}. Corrigez le code postal ou choisissez une adresse desservie.`,
          );
          return;
        }
        setCpZoneError(null);
        const next: QualifiedAddress = {
          ...address,
          // La rue AFFICHÉE (état street) doit suivre : {...address} seul
          // persistait une chimère « ancienne rue + nouveau CP », rediffusée
          // à l'en-tête via rialto:address-updated (majeur relecteur).
          address: streetRef.current.trim() || address.address,
          postal_code: pc,
          city: body.zone.city ?? address.city,
          zone_id: body.zone.id,
          delivery_fee: Number(body.zone.delivery_fee),
          min_order_amount: Number(body.zone.min_order_amount),
          estimated_delivery_minutes:
            body.zone.estimated_delivery_minutes ??
            address.estimated_delivery_minutes,
        };
        setAddress(next);
        writeAddress(next);
        // Ne remplir la ville QUE si le champ est vierge ou porte encore
        // la ville de l'ancienne zone : la réponse arrive ~600 ms + RTT
        // après la frappe du CP, pile quand le client tape sa ville — ne
        // jamais écraser sa saisie (majeur relecteur). Lecture via ref :
        // mettre city en dépendance relancerait le debounce à chaque
        // frappe de ville.
        if (
          body.zone.city &&
          (!cityRef.current.trim() || cityRef.current === address.city)
        ) {
          setCity(body.zone.city);
        }
      } catch {
        /* réseau ou abort : on garde la zone connue — le POST serveur
           re-vérifie la zone de toute façon et refuse un CP non desservi */
      }
    }, 600);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [postalCode, address, restaurantId]);

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
      const res = await fetch(`/api/rialto/menu-item/${menuItemId}`);
      let item: { id: string; name: string; price: number } | null = null;
      if (res.ok) {
        item = (await res.json()).item ?? null;
      }
      if (!item) return;
      // Helper unique Lot D (remplace aussi l'ancienne clé construite à la
      // main `${id}::::`, fragile si cartLineKey change de format).
      const next = addLinesToCart([
        {
          key: cartLineKey(item.id, [], ""),
          menu_item_id: item.id,
          name: item.name,
          base_price: item.price,
          quantity: 1,
          options: [],
          notes: "",
          unit_price: item.price,
          subtotal: item.price,
          category: null,
        },
      ]);
      setCart(next);
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
      const res = await fetch(`/api/promo-codes/validate`, {
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
        lastValidatedSubtotal.current = subtotal;
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
  // Espèces : plus aucune sous-option depuis la suppression du champ
  // « billets » (décision produit 03.08.2026) — le choix du mode suffit.
  const paymentSubValid =
    paymentMethod === "card"
      ? cardTiming !== null
      : paymentMethod === "cash" || paymentMethod === "twint";
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
    !cpZoneError &&
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
          // Fix total_amount 23.07.2026 : le code entre dans le POST — le
          // serveur valide, consomme et insère le total déjà remisé.
          promo_code: promo?.code ?? null,
          // Lot F : snapshot d'attribution last-touch (UTM/referrer),
          // capté par TrackingProvider, null si provenance inconnue.
          attribution: readAttribution(),
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
      if (!res.ok || !body?.order?.id || !body?.order?.order_number) {
        throw new Error(body?.error ?? "Erreur lors de la commande");
      }

      // Lot E : purchase UNE seule fois, AU RETOUR du POST — jamais sur
      // /confirmation (page rechargeable → doublons garantis). eventID =
      // order_number des deux côtés (transaction_id GA4 / eventID Meta) :
      // la déduplication CAPI sera plug-and-play si activée plus tard.
      // Valeur = le total_amount AUTORITAIRE renvoyé par le serveur — pas
      // le `total` client, qui peut diverger sans 400 (remise % figée à
      // l'application du code puis panier modifié, CP édité vers une autre
      // zone de livraison). Relevé relecteur 24.07.2026.
      // try/catch dédié : la commande EST déjà créée en base — un pépin de
      // tracking ne doit JAMAIS sauter clearCart + redirection (panier
      // intact → resoumission → commande en double).
      // La redirection est une navigation SPA : pas de déchargement, les
      // beacons partent.
      try {
        track.purchase({
          orderNumber: body.order.order_number as string,
          value: Number(body.order.total_amount ?? total),
          items: cart.map((it) => ({
            id: it.menu_item_id,
            name: it.name,
            price: it.unit_price,
            quantity: it.quantity,
            category: it.category ?? undefined,
          })),
        });
      } catch (err) {
        console.error("[tracking] purchase failed", err);
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
        className="container-hero grid grid-cols-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr),380px] lg:gap-6 lg:py-6"
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

                {cpZoneError && (
                  <p className="text-xs font-medium text-rialto">
                    ⚠️ {cpZoneError}
                  </p>
                )}

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
                      {etaLive?.label ??
                        `~${address.estimated_delivery_minutes} min`}
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
                  onClick={() => setPaymentMethod("card")}
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
                    À régler au livreur
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("twint");
                    setCardTiming(null);
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

              {/* Espèces : note informative seule — le champ « billets » a
                  été SUPPRIMÉ (décision produit 03.08.2026, les livreurs
                  gèrent leur monnaie hors outil). Même motif visuel que les
                  notes carte/Twint. */}
              {paymentMethod === "cash" && (
                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 transition-all duration-200">
                  💵 Vous paierez en espèces au livreur, à la livraison.
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
              {freeDelivery ? (
                <Row label="Frais de livraison" value="Offerte" accent />
              ) : (
                <Row label="Frais de livraison" value={formatCHF(deliveryFee)} />
              )}
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
            {/* LS2 : encouragement au palier — l'état « atteint » est porté
                par la ligne « Offerte » du récapitulatif ci-dessus. */}
            {fdMilestone && !fdMilestone.reached && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-800">
                {fdMilestone.labelPending}
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
              Livré en{" "}
              {etaLive?.label ?? `~${address.estimated_delivery_minutes} min`}
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
