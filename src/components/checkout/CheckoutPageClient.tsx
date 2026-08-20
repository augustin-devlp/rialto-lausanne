"use client";

/**
 * Page /checkout — refonte UI lot 1 (É7, 20.08.2026, layout Uber Eats).
 *
 * En-tête minimal local (« Retour à l'établissement » + logo, rien
 * d'autre — l'AppHeader global est null sur cette route : zéro fuite).
 * Colonne GAUCHE (2/3) : 1. Logement · 2. Détails de la livraison
 * (adresse, champs adaptatifs, MODE DE REMISE exclusif) · 3. Option de
 * livraison (Standard / Planifié) · 4. Moyen de paiement · 5. Coordonnées.
 * Colonne DROITE (1/3, sticky) : établissement + CTA principal
 * sans scroll, récapitulatif du panier REPLIABLE, code promotionnel,
 * totaux, second CTA.
 *
 * ⚠️ « PLANIFIÉ » N'EST PAS UNE PLANIFICATION : l'heure choisie part dans
 * requested_pickup_time (champ existant, visible caisse) mais la
 * préparation démarre immédiatement et l'ETA reste ancré sur
 * l'acceptation. Assumé et temporaire (décision Augustin 20.08) — la
 * planification réelle est un point BLOQUANT go-live (GO_LIVE.md).
 *
 * Préremplissage silencieux via localStorage RIALTO:CHECKOUT_PREFILL:V1.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { CartItem, HousingType } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import {
  cartCount,
  cartSubtotal,
  clearAddress,
  clearCart,
  readAddress,
  readCart,
  readPrefill,
  villeSeedable,
  writeCart,
  writePrefill,
  type QualifiedAddress,
} from "@/lib/clientStore";
import AdresseLivraisonPopup from "@/components/address/AdresseLivraisonPopup";
import { track } from "@/lib/tracking";
import {
  debuteOperationCritique,
  termineOperationCritique,
} from "@/lib/operationCritique";
import { RIALTO_INFO, matchDishImage } from "@/lib/rialto-data";
import WheelTimePicker from "./WheelTimePicker";
import RialtoLogo from "@/components/brand/RialtoLogo";
import {
  PictoBillet,
  PictoCalendrier,
  PictoCarte,
  PictoHorloge,
  PictoImmeuble,
  PictoLivreur,
  PictoMaison,
  PictoTelephone,
} from "@/components/ui/Pictos";
import { effectiveDeliveryFee } from "@/lib/delivery/rule";
import { useEtaRange } from "@/lib/eta/useEtaRange";
import { comptePizzasPanier } from "@/lib/eta/pizzas";
import { useFreeDeliveryRule } from "@/lib/delivery/useFreeDeliveryRule";
import { getFreeDeliveryMilestone } from "@/lib/delivery/milestones";
import { readAttribution } from "@/lib/attribution";

type Props = {
  restaurantId: string;
  accepting: boolean;
};

const STAMPIFY_BUSINESS_ID = "59b10af2-5dbc-4ddd-a659-c49f44804bff";

type PaymentMethod = "card" | "cash" | "twint";
type CardTiming = "on_delivery" | "remote";


export default function CheckoutPageClient({
  restaurantId,
  accepting,
}: Props) {
  const router = useRouter();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<QualifiedAddress | null>(null);

  // Section 1 : logement
  const [housingType, setHousingType] = useState<HousingType | null>(null);
  // Refonte 20.08 : mode + sous-option de remise (présentation pure — se
  // matérialise en préfixe de delivery_instructions au submit, aucun
  // champ métier nouveau). Familles MUTUELLEMENT EXCLUSIVES.
  const [remiseMode, setRemiseMode] = useState<"main_propre" | "laisser_porte">(
    "main_propre",
  );
  const [remiseOption, setRemiseOption] = useState("porte");
  // true dès que le client a touché au mode de remise : le préfixe
  // REMISE ne part QUE dans ce cas (ou si un choix différent du défaut
  // est restauré du prefill) — le défaut intouché n'écrit rien, comme
  // historiquement (relecture 20.08).
  const [remiseTouchee, setRemiseTouchee] = useState(false);
  // Édition des détails de livraison (compact par défaut si prefill) et
  // panneau des instructions livreur.
  const [editionLivraison, setEditionLivraison] = useState(false);
  const [panneauInstructions, setPanneauInstructions] = useState(false);

  // BROUILLON du panneau instructions (correctif « fermer = annuler »
  // 20.08). Le brouillon du pop-up LIVRAISON vit désormais dans le
  // composant PARTAGÉ AdresseLivraisonPopup (même voie que l'en-tête).
  const [dRemiseMode, setDRemiseMode] = useState<
    "main_propre" | "laisser_porte"
  >("main_propre");
  const [dRemiseOption, setDRemiseOption] = useState("porte");
  const [dInstructions, setDInstructions] = useState("");
  // Brouillon du « choix fait » : armé par un clic dans le panneau, il ne
  // devient remiseTouchee (donc préfixe REMISE) qu'à l'Enregistrer —
  // ouvrir puis enregistrer SANS toucher ne doit rien écrire (invariant
  // « le défaut intouché n'écrit rien », relecture 20.08).
  const [dRemiseTouchee, setDRemiseTouchee] = useState(false);

  // Panneau instructions : verrou du scroll body + fermeture Escape
  // (pattern FilterModal). Le pop-up livraison gère les siens dans le
  // composant partagé.
  useEffect(() => {
    if (!panneauInstructions) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanneauInstructions(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [panneauInstructions]);

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
  // sous-total pour lequel la remise a été validée (évite les re-fetchs
  // en boucle).
  const lastValidatedSubtotal = useRef<number | null>(null);

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
      // Purge le cookie-drapeau aussi (anti-boucle, relecture 20.08).
      clearAddress();
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
    // Nouvelle zone qualifiée dans CETTE session (CP différent de la
    // dernière commande) : la rue du gate prime sur le prefill — sinon
    // la vue compacte affichait « ancienne rue — nouveau CP »
    // (relecture 20.08).
    // Le prefill n'est digne de confiance que s'il porte le MÊME NPA que
    // l'adresse qualifiée : différent → autre zone ; VIDE → résidu du bug
    // NPA-vidé pré-correctif (R-2026-044) — dans les deux cas sa rue et
    // sa ville sont mariées à un autre NPA (relecture 20.08).
    const prefillCoherent =
      !!p.postalCode && p.postalCode === a.postal_code;
    // La rue de l'adresse QUALIFIÉE prime toujours : re-saisie au gate ou
    // au pop-up, elle est au moins aussi fraîche que le prefill de la
    // dernière commande (relecture 20.08 — l'ordre inverse renvoyait la
    // commande à l'ancienne rue après un re-gate à NPA identique).
    const rueGate = (a.address ?? "").trim();
    const rue0 = rueGate || (prefillCoherent ? (p.street ?? "").trim() : "");
    const npa0 = a.postal_code ?? "";
    // Ville : jamais un libellé multi-communes « A / B / C » de la grille
    // en guise de « ville saisie » (relecture 20.08).
    const ville0 =
      villeSeedable(a.city) ?? (prefillCoherent ? p.city ?? "" : "");
    setStreet(rue0);
    setPostalCode(npa0);
    setCity(ville0);
    setHousingType(p.housingType ?? null);
    // Première visite (aucun logement connu) : le pop-up partagé s'ouvre
    // — il se seede lui-même depuis la graine (les états posés ci-dessus).
    if (!p.housingType) setEditionLivraison(true);
    // Détails de logement : MÊME garde de cohérence que la rue et la
    // ville (relecture 20.08) — un prefill au NPA divergent porte les
    // codes d'entrée/étage/sonnette d'une AUTRE adresse.
    setEntryCode1(prefillCoherent ? p.entryCode1 ?? "" : "");
    setEntryCode2(prefillCoherent ? p.entryCode2 ?? "" : "");
    setFloor(prefillCoherent ? p.floor ?? "" : "");
    setApartmentNumber(prefillCoherent ? p.apartmentNumber ?? "" : "");
    setDoorbellName(prefillCoherent ? p.doorbellName ?? "" : "");
    setInstructions(p.instructions ?? "");
    setRemiseMode(p.remiseMode ?? "main_propre");
    setRemiseOption(p.remiseOption ?? "porte");
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
  // Moteur de statuts (refonte par ressource 18.08.2026) : fourchette ETA
  // VIVANTE (même moteur que la page de suivi), alimentée par le compte de
  // pizzas du panier. Le figé de zone n'est plus qu'un repli réseau.
  const etaLive = useEtaRange(address?.postal_code, comptePizzasPanier(cart));
  // Refonte zones 18.08 : le seuil de gratuité est PAR ZONE (min + offset)
  // — le min_order_amount de l'adresse qualifiée entre dans le calcul.
  const deliveryFee =
    fdRule && address
      ? effectiveDeliveryFee(
          subtotal,
          zoneFee,
          Number(address.min_order_amount ?? 0),
          fdRule,
        )
      : zoneFee;
  const freeDelivery = zoneFee > 0 && deliveryFee === 0;
  const fdMilestone = getFreeDeliveryMilestone(
    subtotal,
    address
      ? {
          min_order_amount: Number(address.min_order_amount ?? 0),
          delivery_fee: zoneFee,
        }
      : null,
    fdRule,
  );
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

  /** Même règle pour le panneau instructions : brouillon, fermer =
   *  annuler, « Enregistrer » = committer. */
  function ouvrirPanneauInstructions() {
    setDRemiseMode(remiseMode);
    setDRemiseOption(remiseOption);
    setDInstructions(instructions);
    setDRemiseTouchee(false);
    setPanneauInstructions(true);
  }

  function enregistrerInstructions() {
    setRemiseMode(dRemiseMode);
    setRemiseOption(dRemiseOption);
    setInstructions(dInstructions);
    // Le préfixe REMISE ne s'arme que si un choix a été CLIQUÉ dans le
    // panneau : ouvrir puis Enregistrer sans rien toucher n'écrit rien
    // (invariant historique, relecture 20.08).
    if (dRemiseTouchee) setRemiseTouchee(true);
    setPanneauInstructions(false);
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
  // Restauration du garde de l'ancien <input type=time required> (le
  // picker roues n'a pas de required natif) : en « Planifié » sans heure
  // posée (créneaux épuisés), pas de soumission (relecture 20.08).
  const horaireValid = asap || pickupTime !== "";
  const canSubmit =
    horaireValid &&
    housingValid &&
    addressValid &&
    paymentBaseValid &&
    paymentSubValid &&
    contactValid &&
    amountValid &&
    !editionLivraison &&
    !panneauInstructions &&
    !loading &&
    !!address &&
    accepting;

  const OPTIONS_REMISE: Record<
    "main_propre" | "laisser_porte",
    { cle: string; label: string }[]
  > = {
    main_propre: [
      { cle: "porte", label: "À ma porte" },
      { cle: "exterieur", label: "À l'extérieur" },
      { cle: "hall", label: "Dans le hall d'entrée" },
    ],
    laisser_porte: [
      { cle: "porte", label: "Devant ma porte" },
      { cle: "accueil", label: "À l'accueil" },
    ],
  };
  const libelleOptionRemise =
    OPTIONS_REMISE[remiseMode].find((o) => o.cle === remiseOption)?.label ??
    OPTIONS_REMISE[remiseMode][0].label;
  const resumeRemise =
    remiseMode === "main_propre"
      ? `Remise en mains propres — ${libelleOptionRemise.toLowerCase()}`
      : `Laisser sur place — ${libelleOptionRemise.toLowerCase()}`;

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

      // Opération critique : signale le POST en vol à PwaRegister — la
      // mise à jour SW silencieuse ne doit JAMAIS recharger pendant que
      // la commande part (reload = fetch tranché côté client, commande
      // créée côté serveur, panier intact → commande en double).
      debuteOperationCritique();

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
        remiseMode,
        remiseOption,
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
          // Source UNIQUE : l'adresse QUALIFIÉE (bug 20.08 — le repli
          // « state CP sinon adresse » mélangeait les sources et a envoyé
          // rue et ville neuves avec l'ANCIEN code postal). Le commit
          // atomique du pop-up garantit states === address.
          delivery_postal_code: address.postal_code,
          delivery_city: city.trim() || address.city,
          delivery_zone_id: address.zone_id,
          // Le mode de remise voyage dans les instructions (champ
          // existant, lu par l'étiquette livreur). Le préfixe ne part que
          // si le client a fait un CHOIX (panneau touché ou valeur
          // différente du défaut) — le défaut intouché n'écrit rien.
          delivery_instructions:
            [
              remiseTouchee ||
              remiseMode !== "main_propre" ||
              remiseOption !== "porte"
                ? `REMISE : ${resumeRemise.toLowerCase()}`
                : null,
              instructions.trim() || null,
            ]
              .filter(Boolean)
              .join(" — ") || null,
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
          // Le total EXACT sous les yeux du client : le serveur refuse de
          // facturer au-dessus (409) — le prix affiché engage, frais
          // compris (décision Augustin 20.08).
          expected_total: total,
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
      // Prix de la carte changés pendant la session (409 prix_changes,
      // décision Augustin 20.08 : le prix affiché ENGAGE — jamais de
      // facturation silencieuse au-dessus de l'affiché). Le serveur
      // renvoie les lignes RE-DÉRIVÉES dans l'ordre du payload = l'ordre
      // du panier : on resynchronise les montants, le client relit le
      // nouveau total et re-confirme en connaissance de cause.
      if (
        res.status === 409 &&
        body?.code === "prix_changes" &&
        Array.isArray(body.lignes)
      ) {
        // Resynchronisation par INDEX (les lignes reviennent dans
        // l'ordre du payload = l'ordre du panier), gardée par
        // menu_item_id. Le panier COURANT est relu du storage : les
        // boutons +/− du récap restent actifs pendant le POST, une
        // édition concurrente ne doit pas être écrasée (relecture 20.08).
        const courant = readCart();
        const memeStructure =
          courant.length === cart.length &&
          courant.every((c, i) => c.key === cart[i]?.key);
        const base = memeStructure ? courant : cart;
        const next = base.map((c, i) => {
          const l = body.lignes[i];
          if (!l || l.menu_item_id !== c.menu_item_id) return c;
          return {
            ...c,
            name: String(l.item_name_snapshot ?? c.name),
            base_price: Number(l.item_price_snapshot),
            unit_price: Number(l.unit_price),
            // subtotal recalculé sur la quantité COURANTE (elle peut
            // avoir changé pendant le vol du POST).
            subtotal:
              Math.round(Number(l.unit_price) * c.quantity * 100) / 100,
            // extra_price des options re-dérivés : sans ça le détail du
            // panier affichait des extras périmés sous un total corrigé.
            options: Array.isArray(l.selected_options)
              ? l.selected_options.map(
                  (o: { group: string; name: string; extra_price: number }) => ({
                    group: o.group,
                    name: o.name,
                    extra_price: Number(o.extra_price),
                  }),
                )
              : c.options,
          };
        });
        setCart(next);
        writeCart(next);
        setError(
          String(
            body.error ??
              "Les prix de la carte ont été mis à jour — vérifiez votre panier puis confirmez à nouveau.",
          ),
        );
        setLoading(false);
        // Le message vit dans la colonne de droite, SOUS toutes les
        // sections en mobile : sans ça le client re-confirmait à
        // l'aveugle (relecture 20.08). On déplie le récap (les nouveaux
        // prix y sont) et on amène le message à l'écran.
        requestAnimationFrame(() => {
          document
            .querySelector<HTMLDetailsElement>("details#recap-panier")
            ?.setAttribute("open", "");
          document
            .getElementById("checkout-erreur")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        return;
      }
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
      // beacons partent. ⚠️ Tenu par PwaRegister : la mise à jour SW
      // silencieuse n'active/ne recharge JAMAIS à l'arrivée sur
      // /confirmation (exclusion explicite) — sans elle, le reload
      // détruirait ce purchase (relecture 17.08).
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
    } finally {
      termineOperationCritique();
    }
  }

  if (!address) return null;

  return (
    <main className="min-h-screen bg-white pb-28 md:pb-12">
      <header className="border-b border-border bg-white/95 backdrop-blur-lg">
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
            Retour à l&apos;établissement
          </Link>
          {/* É7 : logo au centre, RIEN d'autre — zéro fuite (pas de menu,
              pas de recherche, pas de caddie ; l'AppHeader global est
              null sur /checkout). */}
          <RialtoLogo size="sm" asStatic />
          <span className="w-[170px]" />
        </div>
      </header>

      <form
        onSubmit={handleSubmit}
        className="container-hero grid grid-cols-1 gap-5 py-5 lg:grid-cols-[minmax(0,1fr),380px] lg:gap-6 lg:py-6"
      >
        {/* ─── Colonne gauche (le récap panier vit dans la colonne
            droite, repliable ; les suggestions vivent dans le tiroir
            panier — plus d'upsell au checkout, décision 20.08) ──── */}
        <div className="space-y-8">
          {/* ─────── SECTION 1 — DÉTAILS DE LA LIVRAISON (refonte 20.08) ──
              Vue COMPACTE (logement en gras + adresse + Modifier) quand
              tout est connu ; l'édition (cartes logement SANS
              sous-description + champs) ne se déplie qu'au premier
              passage ou au clic sur Modifier — qui permet de changer
              l'adresse ET le type de logement. Sélection : fond blanc,
              contour rouge Rialto + ombre légère (les fonds beiges de
              sélection sont bannis du checkout). */}
          <Section title="Détails de la livraison" step="1">
            {housingType !== null ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 text-rialto">
                    {housingType === "house" ? (
                      <PictoMaison size={26} />
                    ) : (
                      <PictoImmeuble size={26} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="font-bold text-ink">
                      {housingType === "house" ? "Maison" : "Appartement"}
                    </div>
                    <div className="truncate text-sm text-mute">
                      {[street, [postalCode, city].filter(Boolean).join(" ")]
                        .filter((x) => x && x.trim())
                        .join(" — ")}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditionLivraison(true)}
                  className="shrink-0 rounded-btn border border-border px-3.5 py-2 text-sm font-semibold text-ink transition hover:border-ink"
                >
                  Modifier
                </button>
              </div>
            ) : null}
            {housingType === null && (
              <button
                type="button"
                onClick={() => setEditionLivraison(true)}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 text-left transition hover:border-ink"
              >
                <span className="flex items-center gap-3">
                  <span className="shrink-0 text-rialto">
                    <PictoMaison size={26} />
                  </span>
                  <span className="font-bold text-ink">
                    Renseigner l&apos;adresse de livraison
                  </span>
                </span>
                <span className="shrink-0 rounded-btn border border-border px-3.5 py-2 text-sm font-semibold text-ink">
                  Choisir
                </span>
              </button>
            )}
            {/* L'erreur de zone et l'adresse incomplète doivent rester
                VISIBLES en vue compacte (relecture 20.08 — bloquant :
                le CTA se grisait sans plus aucun message à l'écran,
                y compris quand l'erreur arrivait après le repli via le
                debounce du re-check de CP). */}
            {housingType !== null && street.trim().length < 3 && (
              <p className="mt-2 text-xs font-medium text-rialto">
                Adresse incomplète — cliquez Modifier pour la corriger.
              </p>
            )}

            {/* UN SEUL bouton « Instructions pour le livreur » — ouvre le
                panneau des choix au lieu de tout déplier (spec 20.08). */}
            {housingType !== null && (
              <button
                type="button"
                onClick={ouvrirPanneauInstructions}
                className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-border bg-white p-4 text-left transition hover:border-ink"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="shrink-0 text-rialto">
                    <PictoLivreur size={26} />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-bold text-ink">
                      {resumeRemise}
                    </span>
                    <span className="block truncate text-sm text-mute">
                      {instructions.trim()
                        ? instructions.trim()
                        : "Instructions pour le livreur"}
                    </span>
                  </span>
                </span>
                <span className="shrink-0 rounded-btn border border-border px-3.5 py-2 text-sm font-semibold text-ink">
                  Modifier
                </span>
              </button>
            )}
          </Section>

          {/* ───────── SECTION 3 — OPTION DE LIVRAISON (É7) ─────────
              « Planifié » rhabille le sélecteur d'heure EXISTANT :
              l'heure part dans requested_pickup_time (champ existant,
              visible à la caisse) mais AUCUN moteur ne planifie — la
              préparation démarre immédiatement et l'ETA reste ancré sur
              l'acceptation. ASSUMÉ ET TEMPORAIRE (décision Augustin
              20.08) : la planification réelle (scheduled_for, caisse,
              ETA ancré sur le créneau) est un chantier à part,
              OBLIGATOIRE avant le go-live — point bloquant GO_LIVE.md. */}
          {housingType !== null && (
            <Section title="Option de livraison" step="2">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAsap(true)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    asap
                      ? "border-[#C73E1D] bg-white shadow-card"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="mb-1 text-rialto"><PictoHorloge size={22} /></div>
                  <div className="text-sm font-bold">Standard</div>
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
                      ? "border-[#C73E1D] bg-white shadow-card"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="mb-1 text-rialto"><PictoCalendrier size={22} /></div>
                  <div className="text-sm font-bold">Planifié</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Choisir un créneau
                  </div>
                </button>
              </div>
              {!asap && (
                // Roues défilantes style iOS (décision 20.08) — remonte
                // « HH:MM » comme l'ancien input time, s'initialise au
                // premier créneau valide (ouverture + délai minimum ≈ ETA).
                <WheelTimePicker
                  value={pickupTime}
                  onChange={setPickupTime}
                  minLeadMinutes={Math.max(45, etaLive?.min_minutes ?? 0)}
                />
              )}
            </Section>
          )}

          {/* ───────────── SECTION 4 — MOYEN DE PAIEMENT ───────── */}
          {housingType !== null && (
            <Section title="Moyen de paiement" step="3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("card")}
                  className={`p-5 rounded-2xl border-2 transition-all text-left ${
                    paymentMethod === "card"
                      ? "border-[#C73E1D] bg-white shadow-card"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="mb-2 text-rialto"><PictoCarte size={26} /></div>
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
                      ? "border-[#C73E1D] bg-white shadow-card"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="mb-2 text-rialto"><PictoBillet size={26} /></div>
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
                      ? "border-[#C73E1D] bg-white shadow-card"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="mb-2 text-rialto"><PictoTelephone size={26} /></div>
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
                          ? "border-[#C73E1D] bg-white shadow-card"
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
                          ? "border-[#C73E1D] bg-white shadow-card"
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
                      Rialto vous enverra un lien de paiement par
                      WhatsApp ou SMS sur votre numéro, dans les 5
                      minutes.
                    </div>
                  )}
                  {cardTiming === "on_delivery" && (
                    <div className="mt-3 p-3 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700">
                      Le livreur arrivera avec le terminal de paiement.
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
                  Vous paierez en espèces au livreur, à la livraison.
                </div>
              )}

              {/* Twint message */}
              {paymentMethod === "twint" && (
                <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200 text-sm text-gray-700 transition-all duration-200">
                  Le livreur vous montrera le QR code Twint à l&apos;arrivée.
                  Vous payerez directement sur place.
                </div>
              )}
            </Section>
          )}

          {/* ───────────── SECTION 4 — COORDONNÉES ─────────────── */}
          {housingType !== null && (
            <Section title="Vos coordonnées — prénom et numéro de téléphone" step="4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    aria-label="Prénom"
                    required
                    autoComplete="given-name"
                    className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                  <input
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Téléphone (+41…)"
                    aria-label="Numéro de téléphone"
                    required
                    autoComplete="tel"
                    className="px-4 py-3 rounded-xl border-2 border-gray-200 focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                </div>
                <div>
                  {/* ⚠️ JURIDIQUE (décisions Augustin 20.08) : la promesse
                      « jamais de publicité » ne vaut QUE POUR L'EMAIL — le
                      marketing Rialto passe ACTIVEMENT par SMS sur le
                      numéro. Elle vit dans le LIBELLÉ du champ email et
                      NULLE PART ailleurs : sous le téléphone ou en pied de
                      section, elle engloberait le numéro et promettrait
                      par écrit l'inverse de ce que nous faisons. */}
                  <label
                    htmlFor="checkout-email"
                    className="mb-1 block text-xs font-medium text-mute"
                  >
                    Email (optionnel — uniquement pour votre reçu, jamais
                    de publicité)
                  </label>
                  <input
                    id="checkout-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full px-4 py-3 rounded-xl border border-border focus:border-[#C73E1D] focus:outline-none text-base"
                  />
                </div>
              </div>
            </Section>
          )}

        </div>

        {/* ─── Colonne droite : récap + CTA ────────────────── */}
        <aside className="lg:sticky lg:top-8 lg:h-fit">
          <div className="rounded-3xl border border-border bg-white p-6 shadow-card">
            {/* É7 : nom de l'établissement + CTA PRINCIPAL visible sans
                scroller (le second CTA vit en bas de la colonne). */}
            <div className="text-xs font-semibold uppercase tracking-wider text-mute">
              Votre commande chez
            </div>
            <div className="mt-0.5 font-display text-lg font-bold text-ink">
              Rialto — Av. de Béthusy 29, Lausanne
            </div>
            <button
              type="submit"
              disabled={!canSubmit}
              className="mt-4 w-full bg-[#C73E1D] hover:bg-[#9A2E14] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-3.5 rounded-btn text-base transition-colors"
            >
              {loading
                ? "Envoi…"
                : `Confirmer ma commande — ${total.toFixed(2)} CHF`}
            </button>

            {/* Récapitulatif du panier — REPLIABLE au chevron (É7). */}
            <details
              id="recap-panier"
              className="group mt-5 border-t border-border pt-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
                <span className="font-display text-base font-bold">
                  Récapitulatif du panier ({count} article{count > 1 ? "s" : ""})
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-mute transition-transform group-open:rotate-180" aria-hidden>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <div className="mt-3 space-y-2">
                {cart.map((item) => (
                  <CartLineRow
                    key={item.key}
                    item={item}
                    onIncr={() => updateQuantity(item.key, 1)}
                    onDecr={() => updateQuantity(item.key, -1)}
                  />
                ))}
              </div>
            </details>

            {/* Code promotionnel (déplacé de la colonne gauche, É7). */}
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
                        aria-label="RIA-XXXXX"
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
                      <p className="text-xs text-rialto">{promoError}</p>
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

            <h3 className="mt-4 border-t border-border pt-4 font-display text-xl font-bold">Récapitulatif</h3>
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

            {/* Mention légale allergènes (denrées alimentaires CH, 19.08). */}
            <p className="mt-3 text-xs text-mute">
              Informations sur les allergènes disponibles sur demande —{" "}
              <a href={`tel:${RIALTO_INFO.phoneTel}`} className="underline">
                {RIALTO_INFO.phoneDisplay}
              </a>
              .
            </p>

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
              <div
                id="checkout-erreur"
                role="alert"
                aria-live="assertive"
                className="mt-4 rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-[#C73E1D] hover:bg-[#9A2E14] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-btn text-lg shadow-lg transition-colors mt-6"
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
            className="w-full bg-[#C73E1D] hover:bg-[#9A2E14] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold py-4 rounded-btn text-base shadow-lg transition-colors"
          >
            {loading
              ? "Envoi…"
              : `Confirmer — ${total.toFixed(2)} CHF`}
          </button>
        </div>
        {/* ─── Pop-up « Détails de la livraison » : LE composant PARTAGÉ
            (même voie que le « Modifier » de l'en-tête — décision Augustin
            20.08 : une seule voie de modification d'adresse dans tout le
            site, plus jamais de détour par la home). */}
        <AdresseLivraisonPopup
          restaurantId={restaurantId}
          ouvert={editionLivraison}
          graine={{
            housingType,
            street,
            npa: postalCode,
            ville: city,
            entryCode1,
            entryCode2,
            floor,
            apartmentNumber,
            doorbellName,
          }}
          onAnnuler={() => setEditionLivraison(false)}
          onEnregistre={(c) => {
            setAddress(c.adresse);
            setHousingType(c.housingType);
            setStreet(c.adresse.address);
            setPostalCode(c.adresse.postal_code);
            setCity(c.adresse.city ?? "");
            setEntryCode1(c.entryCode1);
            setEntryCode2(c.entryCode2);
            setFloor(c.floor);
            setApartmentNumber(c.apartmentNumber);
            setDoorbellName(c.doorbellName);
            setEditionLivraison(false);
          }}
        />

        {/* ─── Panneau « Instructions pour le livreur » (spec 20.08) ───
            Deux familles MUTUELLEMENT EXCLUSIVES — les options de l'une
            ne s'affichent jamais sous l'autre — + champ libre.
            Formulations maison, aucun texte copié d'Uber Eats. */}
        {panneauInstructions && (
          <div
            className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm md:items-center md:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setPanneauInstructions(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Instructions pour le livreur"
              className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-pop md:rounded-3xl"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-lg font-bold text-ink">
                  Instructions pour le livreur
                </h3>
                <button
                  type="button"
                  onClick={() => setPanneauInstructions(false)}
                  className="rounded-full p-2 text-mute hover:bg-neutral-100"
                  aria-label="Fermer"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="6" y1="18" x2="18" y2="6" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDRemiseMode("main_propre");
                    setDRemiseOption("porte");
                    setDRemiseTouchee(true);
                  }}
                  className={`rounded-2xl border-2 p-3 text-left transition-all ${
                    dRemiseMode === "main_propre"
                      ? "border-[#C73E1D] bg-white shadow-card"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="text-sm font-bold text-ink">
                    Remise en mains propres
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDRemiseMode("laisser_porte");
                    setDRemiseOption("porte");
                    setDRemiseTouchee(true);
                  }}
                  className={`rounded-2xl border-2 p-3 text-left transition-all ${
                    dRemiseMode === "laisser_porte"
                      ? "border-[#C73E1D] bg-white shadow-card"
                      : "border-gray-200 bg-white"
                  }`}
                >
                  <div className="text-sm font-bold text-ink">
                    Laisser sur place
                  </div>
                </button>
              </div>

              {/* Sous-options DE LA FAMILLE CHOISIE uniquement. */}
              <div className="mt-3 space-y-1.5">
                {OPTIONS_REMISE[dRemiseMode].map((o) => (
                  <button
                    key={o.cle}
                    type="button"
                    onClick={() => {
                      setDRemiseOption(o.cle);
                      setDRemiseTouchee(true);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-xl border px-3.5 py-2.5 text-left text-sm transition ${
                      dRemiseOption === o.cle
                        ? "border-[#C73E1D] font-semibold text-ink shadow-card"
                        : "border-border text-ink hover:border-ink"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        dRemiseOption === o.cle ? "bg-rialto" : "bg-border"
                      }`}
                      aria-hidden
                    />
                    {o.label}
                  </button>
                ))}
              </div>

              {dRemiseMode === "laisser_porte" && (
                <p className="mt-3 rounded-xl border border-border bg-neutral-50 p-3 text-xs text-gray-700">
                  Le paiement se fait à la remise chez Rialto : pour un
                  dépôt sans contact, choisissez « Carte — à distance »
                  comme moyen de paiement, sinon le livreur devra tout de
                  même vous rencontrer pour encaisser.
                </p>
              )}

              <textarea
                value={dInstructions}
                onChange={(e) => setDInstructions(e.target.value)}
                placeholder="Instructions libres — portail, chien, sonnette, etc."
                aria-label="Instructions libres"
                rows={2}
                className="mt-3 w-full resize-none rounded-xl border border-border px-4 py-3 text-sm focus:border-[#C73E1D] focus:outline-none"
              />

              <button
                type="button"
                onClick={enregistrerInstructions}
                className="btn-primary mt-4 w-full"
              >
                Enregistrer
              </button>
            </div>
          </div>
        )}
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
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-2 py-0.5">
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
