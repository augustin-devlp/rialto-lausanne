"use client";

/**
 * Page /confirmation/[orderNumber] — célébration post-commande.
 * - Checkmark animé + message merci
 * - Récap items
 * - Timeline état commande avec polling 15s
 * - Bouton "Créer carte fidélité" → ouvre modal/signup
 * - Bouton "Télécharger ticket PDF" (optionnel, via endpoint existant)
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatCHF } from "@/lib/format";
import { RIALTO_INFO } from "@/lib/rialto-data";
import { writeCustomerSession } from "@/lib/customerSession";
import { useStampRule } from "@/lib/loyalty/useStampRule";
import StampRow from "@/components/loyalty/StampRow";
import { computeEtaRange, formatEtaRange, formatEtaRemaining } from "@/lib/eta/eta";
import {
  derivePhase,
  ORDRE,
  type DerivedPhase,
  type PhaseKey,
} from "@/lib/eta/phase";
import {
  PHASE_TICK_MS,
  TAP_AGE_MIN_MIN,
  TAP_AGE_MAX_H,
} from "@/lib/eta/constants";

type OrderStatus =
  | "new"
  | "accepted"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

/**
 * Intrants du moteur de statuts, fournis par le serveur (SSR + poll).
 * Shape découplée de src/lib/eta/server.ts (module serveur : on ne
 * l'importe pas ici, même en type-only, par hygiène de frontière).
 */
type EtaIntrants = {
  accepted_at: string | null;
  pizzas_commande: number;
  pizzas_en_cuisine_devant: number;
  retour_livreur_minutes: number;
  poids_prior: number;
  latence: "rapide" | "lente" | null;
  zone_minutes: number | null;
};

type OrderData = {
  id: string;
  order_number: string;
  status: OrderStatus;
  customer_name: string;
  customer_phone: string;
  total_amount: number;
  fulfillment_type: "pickup" | "delivery";
  delivery_address: string | null;
  delivery_postal_code: string | null;
  delivery_city: string | null;
  created_at: string;
  /** TAP1 (cross-device) : le tap d'un autre appareil arrive par ici. */
  customer_confirmed_delivered_at?: string | null;
  requested_pickup_time: string | null;
  eta_intrants?: EtaIntrants | null;
  items: Array<{
    item_name_snapshot: string;
    item_price_snapshot: number;
    quantity: number;
    selected_options: Array<{ group?: string; name: string }>;
    subtotal: number;
  }>;
};

type Props = {
  order: OrderData;
  /** Jeton d'accès à la commande (21.08). Le polling de statut et le tap
   *  « ma commande est arrivée » interrogent des routes désormais gardées :
   *  sans lui, le suivi se figerait sur son rendu initial. */
  accessToken: string;
};

/**
 * Stepper du moteur de statuts DÉRIVÉS (08.08.2026) : les étapes ne
 * mappent plus les statuts DB bruts mais les PHASES calculées par
 * src/lib/eta/phase.ts — f(acceptation, ETA, maintenant), rejouée à
 * chaque render + tick 30 s. Deux variantes selon le mode.
 */
/**
 * ⚠️ QUATRE ÉTAPES, PAS CINQ (décision Augustin 21.08). L'étape « Livrée »
 * a été RETIRÉE de l'affichage : tout le suivi repose sur des ESTIMATIONS,
 * donc « Livré » ne peut pas être affirmé — le client aurait sa pizza en
 * main pendant que l'écran dirait autre chose, ou l'inverse. On ne montre
 * jamais une certitude qu'on n'a pas.
 *
 * ⚠️ LE MOTEUR N'EST PAS TOUCHÉ : src/lib/eta/phase.ts continue de
 * calculer la phase `delivered` (stepIndex 4). Comme la liste n'a plus que
 * 4 entrées (indices 0-3), `done = idx <= 4` coche TOUTES les étapes et
 * `current = idx === 4` n'en active AUCUNE : une fois la commande arrivée,
 * les quatre pastilles sont pleines et rien ne clignote. C'est exactement
 * l'état voulu, obtenu sans une ligne de logique métier.
 */
const STEPS_DELIVERY: { key: PhaseKey; label: string; description: string }[] = [
  {
    key: "waiting",
    label: "Commande reçue",
    description: "Rialto a bien reçu votre commande.",
  },
  {
    key: "confirmed",
    label: "Commande confirmée",
    description: "Le restaurant a accepté votre commande.",
  },
  {
    key: "preparing",
    label: "En préparation",
    // Texte FIXE (Augustin 21.08) : l'ancien s'adaptait au panier (« Les
    // pâtes sont au four ») — complexité inutile, et il pouvait mentir
    // sur une commande sans pâtes.
    description: "Rialto prépare votre commande.",
  },
  {
    key: "delivering",
    label: "Votre commande arrive",
    description: "Le livreur est en route.",
  },
];

const STEPS_PICKUP: { key: PhaseKey; label: string; description: string }[] = [
  {
    key: "waiting",
    label: "Commande reçue",
    description: "Rialto a bien reçu votre commande.",
  },
  {
    key: "confirmed",
    label: "Commande confirmée",
    description: "Le restaurant a accepté votre commande.",
  },
  {
    key: "preparing",
    label: "En préparation",
    description: "Rialto prépare votre commande.",
  },
  {
    key: "ready",
    label: "Prête",
    description: "À retirer au comptoir.",
  },
];

type LoyaltyCardState =
  | { status: "idle" }
  | { status: "checking" }
  | {
      status: "has_card";
      short_code: string;
      current_stamps: number;
      stamps_required: number;
      reward_description: string;
      /**
       * Tampons EN ATTENTE de validation (état dérivé, jamais écrit).
       * Valeur BRUTE : StampRow porte le clamp.
       * ⚠️ Ce champ manquait — le lookup le renvoyait déjà, mais il était
       * jeté au parsing, donc la page de confirmation n'a JAMAIS affiché la
       * gratification immédiate. C'était toute la promesse de l'architecture.
       */
      pending_stamps: number;
      /** Phase 10 C2D : false = SMS non parti (crédits Brevo, etc.)
       *  → afficher un fallback "copie ce lien en favori". */
      sms_sent?: boolean;
      sms_fallback_url?: string | null;
    }
  | { status: "needs_signup" }
  | { status: "signing_up" }
  | { status: "error"; message: string };

export default function ConfirmationClient({
  order: initialOrder,
  accessToken,
}: Props) {
  /** Suffixe de requête portant le jeton, à coller aux appels gardés. */
  const qsJeton = accessToken
    ? `?t=${encodeURIComponent(accessToken)}`
    : "";
  const [order, setOrder] = useState<OrderData>(initialOrder);
  const [loyalty, setLoyalty] = useState<LoyaltyCardState>({ status: "idle" });

  /* ─── Mise à jour du statut : LE SUIVI EST EN POLLING ─────────────────
   *
   * Deux mécanismes (décision Augustin 19.08, post-vérif caisse HY1b) :
   *
   *   1. Polling 15 s sur /api/orders/[id] (service_role côté serveur) —
   *      LA source du suivi : statut, items, intrants ETA, tap
   *      cross-device. Ralenti à 60 s sur une commande annulée (le
   *      détour caisse cancelled→accepted R-2026-043 doit rester
   *      visible), re-accéléré si le statut change.
   *
   *   2. Fetch immédiat à l'arrivée + refetch à chaque retour d'onglet
   *      (visibilitychange) — couvre le retour après 10 min.
   *
   * ⚠️ HISTOIRE : un abonnement Supabase Realtime (postgres_changes) a
   * vécu ici en « source primaire » — il était MUET DEPUIS TOUJOURS
   * (vérif caisse 19.08 : aucune policy SELECT anon sur orders, RLS
   * deny-all → le websocket ne recevait rien). Supprimé le 19.08 : du
   * code qu'on croit actif mais qui ne reçoit rien est pire qu'une
   * absence — trois docs affirmaient « trois canaux convergents » alors
   * que le suivi a toujours vécu du polling. NE PAS le réintroduire sans
   * policy SELECT dédiée (et sans réévaluer l'exposition de la table).
   *
   * Les deux mécanismes appellent le même handleStatusUpdate qui :
   *   - Met à jour le state local SEULEMENT si le status a changé
   *   - Log ça dans la console avec préfixe [timeline]
   */
  useEffect(() => {
    const orderId = order.id;
    const orderNumber = order.order_number;

    let stopped = false;
    let tickCount = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let pollLent = false;
    // statusSeen : le dernier status qu'on A VU — source de vérité client-side.
    // Déclaré ici pour être capturé par la closure et non soumis à React state.
    let statusSeen: OrderStatus = initialOrder.status;

    const handleStatusUpdate = (
      newOrder: OrderData | Partial<OrderData>,
      source: "poll" | "focus" | "initial",
    ) => {
      if (stopped) return;
      const newStatus = newOrder.status as OrderStatus | undefined;
      if (!newStatus) {
        console.warn(
          `[timeline] ${source} payload without status, ignoring`,
          newOrder,
        );
        return;
      }
      tickCount += 1;
      console.log(
        `[timeline] ${source} #${tickCount} orderNumber=${orderNumber} status=${newStatus} statusSeen=${statusSeen}`,
      );
      if (newStatus !== statusSeen) {
        console.log(
          `[timeline] ✅ status CHANGED from ${statusSeen} to ${newStatus} via ${source}`,
        );
        statusSeen = newStatus;
        // Sortie du régime lent (ré-acceptation après annulation,
        // R-2026-043) : le statut bouge à nouveau → cadence normale.
        if (pollLent && newStatus !== "cancelled" && newStatus !== "completed") {
          if (intervalId) clearInterval(intervalId);
          intervalId = setInterval(() => void fetchStatus("poll"), 15_000);
          pollLent = false;
          console.log("[timeline] poll re-accéléré à 15 s");
        }
        // Phase 9 FIX 3 : TOUJOURS merger avec prev pour préserver
        // les items — garde par CONTENU conservée après la suppression
        // du realtime (19.08) : elle protège aussi d'un payload poll
        // partiel. Si on remplaçait l'order complet sans items,
        // `order.items` deviendrait undefined et le JSX crasherait.
        // Le poll HTTP inclut `newOrder.items` (endpoint /api/orders/[id]
        // imbrique items) : on l'utilise si dispo.
        setOrder((prev) => {
          const hasItems =
            "items" in newOrder &&
            Array.isArray((newOrder as OrderData).items);
          const mergedItems = hasItems
            ? (newOrder as OrderData).items
            : prev.items;
          return {
            ...prev,
            ...newOrder,
            items: mergedItems,
            // Même philosophie que les items : un payload sans intrants
            // (collecte en échec côté poll) ne doit pas
            // écraser les intrants connus par null (relecture 18.08 —
            // le stepper retombait sur « Confirmée » sans compte à
            // rebours le temps d'un poll).
            eta_intrants:
              (newOrder as OrderData).eta_intrants ?? prev.eta_intrants,
          } as OrderData;
        });
      }
      if (newStatus === statusSeen) {
        // TAP cross-device : le poll rapporte la colonne posée depuis un
        // autre appareil sans changement de statut — merge dédié, garde
        // par contenu (jamais d'écrasement par null). Latence = un tick
        // de poll (le realtime qui promettait l'instantané était muet).
        const tapServeur = (newOrder as OrderData)
          .customer_confirmed_delivered_at;
        if (tapServeur != null) {
          setOrder((prev) =>
            prev.customer_confirmed_delivered_at != null
              ? prev
              : ({
                  ...prev,
                  customer_confirmed_delivered_at: tapServeur,
                } as OrderData),
          );
        }
      }
      if (newStatus === statusSeen && (newOrder as OrderData).eta_intrants) {
        // Statut inchangé mais intrants ETA présents : garde sur le
        // CONTENU (l'ancre accepted_at), jamais sur la présence de
        // l'objet — un payload partiel (SSR initial, collecte en échec)
        // ne doit pas figer accepted_at:null à vie (bloquant relecteur
        // 13.08 : stepper gelé sur « Confirmée »).
        // accepted_at est stable une fois écrit → pas de boucle possible.
        const next = (newOrder as OrderData).eta_intrants!;
        setOrder((prev) =>
          prev.eta_intrants &&
          prev.eta_intrants.accepted_at === next.accepted_at
            ? prev
            : ({ ...prev, eta_intrants: next } as OrderData),
        );
      }
      if (newStatus === "completed") {
        console.log(`[timeline] terminal status ${newStatus} — stopping`);
        stop();
      }
      if (newStatus === "cancelled" && !pollLent) {
        // Le détour caisse cancelled→accepted EXISTE (R-2026-043) : le
        // realtime qui « couvrait » ce cas était MUET — c'est désormais
        // un poll LENT (60 s) qui le couvre réellement, onglet ouvert
        // compris ; le visibilitychange rattrape au retour d'onglet.
        console.log("[timeline] cancelled — poll ralenti à 60 s");
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(() => void fetchStatus("poll"), 60_000);
        pollLent = true;
      }
    };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    // Exposé pour l'arrêt sur phase DÉRIVÉE terminale : Rialto ne clôture
    // jamais ses commandes en base (statuts accepted à vie), donc sans
    // cet arrêt une page laissée ouverte pollerait pour toujours — et
    // chaque poll paie la collecte d'intrants (relevé relecteur 13.08).
    // ⚠️ Cette poignée ne coupe que le TICK périodique : le refetch
    // visibilitychange reste actif — c'est lui qui rattrape une
    // annulation/ré-acceptation postérieure (R-2026-043) au retour
    // d'onglet une fois la phase terminale atteinte. Le stop() COMPLET
    // reste réservé au démontage et au statut DB terminal (completed).
    stopPollingRef.current = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // ─── 1. Fetch HTTP : tick de polling OU refresh manuel
    const fetchStatus = async (source: "poll" | "focus") => {
      if (stopped) return;
      // Onglet caché : ne pas dépenser un aller-retour toutes les 15 s —
      // le refetch sur visibilitychange rattrape au retour au premier plan.
      if (source === "poll" && document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/orders/${orderId}${qsJeton}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          console.warn(`[timeline] ${source} http=${res.status}`);
          return;
        }
        const body = (await res.json()) as { order?: OrderData };
        if (body.order) handleStatusUpdate(body.order, source);
      } catch (err) {
        console.warn(`[timeline] ${source} network_error`, err);
      }
    };

    // ─── 2. Polling 15 s — LA source du suivi (realtime mort supprimé
    //        le 19.08, voir l'en-tête de l'effet)
    console.log(
      `[timeline] START orderNumber=${orderNumber} order_id=${orderId} initial_status=${statusSeen}`,
    );
    // Fetch immédiat
    void fetchStatus("poll");

    if (statusSeen !== "completed" && statusSeen !== "cancelled") {
      intervalId = setInterval(() => void fetchStatus("poll"), 15_000);
    } else {
      stop();
    }

    // ─── 3. Refetch quand l'onglet redevient visible
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchStatus("focus");
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  // Poignée d'arrêt du polling, posée par l'effet des 3 canaux et tirée
  // par l'effet de phase terminale ci-dessous.
  const stopPollingRef = useRef<(() => void) | null>(null);

  // ─── Moteur de statuts : phase dérivée + tick 30 s ────────────────────
  // Le tick force un re-render : derivePhase est rejouée avec un `now`
  // frais — la timeline avance TOUTE SEULE, sans écriture ni polling
  // supplémentaire (les intrants, eux, arrivent par SSR/poll).
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), PHASE_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const fulfillment = order.fulfillment_type ?? "delivery";
  const intrants = order.eta_intrants ?? null;
  const eta = intrants
    ? computeEtaRange({
        fulfillmentType: fulfillment,
        pizzasCommande: intrants.pizzas_commande,
        pizzasEnCuisineDevant: intrants.pizzas_en_cuisine_devant,
        zoneMinutes: intrants.zone_minutes,
        retourLivreurMinutes: intrants.retour_livreur_minutes,
        poidsPrior: intrants.poids_prior,
        latence: intrants.latence,
        // ANCRÉ sur l'acceptation, pas sur maintenant : un ETA recalculé
        // avec l'heure courante fait SAUTER le rush à 12h/19h pile — le
        // stepper reculait de « En livraison » à « En préparation » sous
        // les yeux du client (bloquant relecteur 13.08). Le rush qui
        // compte est celui du moment où la cuisine a pris la commande ;
        // l'ETA devient monotone. Le checkout, lui, vit au présent.
        now: intrants.accepted_at ? new Date(intrants.accepted_at) : new Date(),
      })
    : null;
  // TAP client (GO 18.08) : mémoire locale par commande, à QUATRE états
  // (relecture 18.08) — null = pas encore lu (rien ne s'affiche : pas de
  // flash SSR), "non" = pas tapé, "pending" = tapé pendant la fenêtre
  // navette TAP1 (le serveur a répondu 503 tap1_non_executee : le geste
  // est honoré à l'écran ET REJOUÉ à chaque montage jusqu'à ce que la
  // colonne existe — sans ce rejeu, toute la vérité terrain de la
  // fenêtre navette était perdue en silence), "fait" = enregistré.
  // Une fois TAP1 exécutée, la colonne sera ajoutée aux selects
  // (cross-device). Pas d'annulation du tap : le libellé du bouton EST
  // la confirmation ; un tap de mégarde reste du bruit borné, assumé.
  const [tapEtat, setTapEtat] = useState<
    null | "non" | "pending" | "fait"
  >(null);
  const [tapEnvoi, setTapEnvoi] = useState(false);
  const [tapErreur, setTapErreur] = useState<string | null>(null);
  const tapEffectue = tapEtat === "pending" || tapEtat === "fait";
  const cleTap = `RIALTO:TAP:${order.id}`;

  const posteTap = useCallback(async (): Promise<
    "fait" | "pending" | "erreur"
  > => {
    const res = await fetch(
      `/api/orders/${order.id}/confirm-delivered${qsJeton}`,
      { method: "POST" },
    );
    if (res.ok) return "fait";
    const body = (await res.json().catch(() => null)) as {
      error?: string;
    } | null;
    // Le corps fait foi : un 503 plateforme (Vercel) n'est PAS la
    // fenêtre navette (relecture 18.08).
    if (res.status === 503 && body?.error === "tap1_non_executee") {
      return "pending";
    }
    if (body?.error === "commande_annulee") {
      setTapErreur("Cette commande a été annulée.");
    } else if (body?.error === "trop_tard") {
      setTapErreur("Ce lien de suivi n'est plus actif.");
    } else if (body?.error !== "pas_encore_confirmee") {
      setTapErreur("Réessayez dans un instant.");
    }
    return "erreur";
  }, [order.id]);

  useEffect(() => {
    // Vérité serveur d'abord (TAP1 exécutée, colonne dans les selects) :
    // un tap posé depuis un AUTRE appareil vaut « fait » ici aussi.
    if (order.customer_confirmed_delivered_at != null) {
      setTapEtat("fait");
      try {
        window.localStorage.setItem(cleTap, "1");
      } catch {}
      return;
    }
    let etat: "non" | "pending" | "fait" = "non";
    try {
      const v = window.localStorage.getItem(cleTap);
      if (v === "1") etat = "fait";
      else if (v === "pending") etat = "pending";
    } catch {
      /* stockage indisponible : bouton réaffiché, idempotence serveur */
    }
    setTapEtat(etat);
    if (etat !== "pending") return;
    // REJEU du tap en attente de navette — jusqu'à l'enregistrement réel.
    void posteTap().then((r) => {
      if (r === "fait") {
        setTapEtat("fait");
        try {
          window.localStorage.setItem(cleTap, "1");
        } catch {}
      }
    });
  }, [cleTap, posteTap, order.customer_confirmed_delivered_at]);

  async function confirmeArrivee() {
    if (tapEnvoi) return;
    setTapEnvoi(true);
    setTapErreur(null);
    try {
      const r = await posteTap();
      if (r === "fait" || r === "pending") {
        setTapEtat(r === "fait" ? "fait" : "pending");
        try {
          window.localStorage.setItem(cleTap, r === "fait" ? "1" : "pending");
        } catch {}
      }
    } catch {
      setTapErreur("Problème de connexion. Réessayez.");
    } finally {
      setTapEnvoi(false);
    }
  }

  // Fenêtre d'affichage du tap : les MÊMES bornes que le serveur
  // (constants.ts) — un CTA que le serveur refuserait est un bouton mort.
  const ageMinutes =
    (Date.now() - new Date(order.created_at).getTime()) / 60_000;
  const tapDansLaFenetre =
    Number.isFinite(ageMinutes) &&
    ageMinutes >= TAP_AGE_MIN_MIN &&
    ageMinutes <= TAP_AGE_MAX_H * 60;

  const phaseBrute = derivePhase({
    status: order.status,
    fulfillmentType: fulfillment,
    acceptedAt: intrants?.accepted_at ?? null,
    eta,
    now: new Date(),
    // 3e intrant forward-only : le tap avance la phase (« Livrée » /
    // « Prête »), jamais l'inverse — le CTA avis suit dans le même geste.
    confirmedDelivered: tapEffectue,
  });
  // CLIQUET D'AFFICHAGE (contre-passe 18.08) : le filet universel de
  // monotonie. L'ancrage serveur rend les intrants quasi déterministes,
  // mais des résidus subsistent (statut d'une autre commande muté entre
  // deux polls, flux récent, repli d'ancre) — quel que soit le serveur,
  // la phase AFFICHÉE n'a pas le droit de reculer ni le restant de
  // remonter. Exception : « Annulée » passe toujours (vraie annulation).
  const cliquet = useRef<{ ordre: number; phase: DerivedPhase } | null>(null);
  let phase = phaseBrute;
  if (phaseBrute.key === "cancelled") {
    cliquet.current = null;
  } else {
    const precedent = cliquet.current;
    if (precedent && ORDRE[phaseBrute.key] < precedent.ordre) {
      phase = precedent.phase; // recul interdit — on garde l'avancée
    } else {
      cliquet.current = { ordre: ORDRE[phase.key], phase };
    }
  }
  // Restant : jamais plus haut que le minimum déjà montré (plateau puis
  // reprise si l'estimation serveur saute vers le haut).
  const remainingPlancher = useRef<number>(Infinity);
  let remainingAffiche = phase.remainingMinutes;
  if (remainingAffiche != null) {
    remainingAffiche = Math.min(remainingAffiche, remainingPlancher.current);
    remainingPlancher.current = remainingAffiche;
  }
  const steps = fulfillment === "pickup" ? STEPS_PICKUP : STEPS_DELIVERY;
  const currentStep = phase.stepIndex;
  // Ligne d'estimation : fourchette prudente avant/pendant, resserrée à
  // l'approche, rien une fois livrée/prête ou annulée. Pré-acceptation
  // pickup : formatEtaRemaining(cuisine) — la MÊME table que le suivi
  // post-acceptation (le libellé livraison bandait une fourchette de
  // trajet qui n'existe pas en retrait, relecture 18.08).
  const etaLabel =
    phase.key === "delivered" || phase.key === "ready" || phase.key === "cancelled"
      ? null
      : remainingAffiche != null
        ? formatEtaRemaining(remainingAffiche)
        : eta
          ? `${
              fulfillment === "pickup"
                ? formatEtaRemaining(eta.kitchenMinutes)
                : formatEtaRange(eta)
            } après confirmation`
          : null;

  // Phase dérivée TERMINALE (« Livrée »/« Prête ») : on coupe le POLLING
  // (le statut DB ne deviendra jamais terminal : Rialto ne clôture pas
  // ses commandes) ; le refetch visibilitychange reste actif — cf. la
  // poignée (le canal realtime historique, muet, a été supprimé le 19.08).
  useEffect(() => {
    if (phase.key === "delivered" || phase.key === "ready") {
      stopPollingRef.current?.();
    }
  }, [phase.key]);

  const firstName = order.customer_name.split(" ")[0] ?? "";
  const isCancelled = order.status === "cancelled";

  /* ─── Carte fidélité : détection automatique au mount ──────────────── */
  const lookupCard = useCallback(async () => {
    if (!order.customer_phone) return;
    // ⚠️ NE PAS écraser une carte déjà affichée. Un setLoyalty({checking})
    // inconditionnel ici rendait INOPÉRANTE la mise à jour fonctionnelle plus
    // bas (le `prev` qu'elle voit après l'await serait toujours "checking",
    // jamais "has_card"), donc sms_sent/sms_fallback_url étaient perdus à
    // CHAQUE relecture — et notamment juste après une inscription, seul
    // moment où sms_sent === false existe. Effet de bord supprimé au passage :
    // la carte ne repasse plus en squelette gris à chaque rafraîchissement.
    setLoyalty((p) => (p.status === "has_card" ? p : { status: "checking" }));
    try {
      const res = await fetch(
        `/api/rialto/loyalty/lookup?phone=${encodeURIComponent(order.customer_phone)}`,
      );
      if (res.ok) {
        const body = (await res.json()) as {
          customer?: { id: string; first_name: string } | null;
          card?: {
            short_code: string | null;
            current_stamps: number;
            stamps_required: number;
            reward_description: string;
          } | null;
          // Univers SÉPARÉ de `card` : jamais additionné au solde acquis.
          pending?: { stamps: number } | null;
        };
        const carte = body.card;
        // Valeur narrowée capturée dans une const : le narrowing d'une
        // PROPRIÉTÉ ne survit pas à la closure de setLoyalty (elle peut
        // s'exécuter plus tard), celui d'une const oui — donc pas de cast.
        const shortCode = carte?.short_code;
        if (carte && shortCode && body.customer) {
          // Sync la session customer côté navigateur (utilisée par le
          // HamburgerMenu pour afficher les liens club connecté)
          writeCustomerSession({
            customer_id: body.customer.id,
            short_code: shortCode,
            phone: order.customer_phone,
            first_name: body.customer.first_name ?? firstName,
          });
          // Mise à jour FONCTIONNELLE : préserve sms_sent / sms_fallback_url
          // posés à l'inscription. Sans ça, cette relecture — appelée aussi à
          // chaque changement de statut (F3) — effacerait le repli « copiez ce
          // lien » affiché quand le SMS n'est pas parti.
          setLoyalty((prev) => ({
            status: "has_card",
            short_code: shortCode,
            current_stamps: carte.current_stamps,
            stamps_required: carte.stamps_required,
            reward_description: carte.reward_description,
            pending_stamps: Math.max(0, body.pending?.stamps ?? 0),
            sms_sent: prev.status === "has_card" ? prev.sms_sent : undefined,
            sms_fallback_url:
              prev.status === "has_card" ? prev.sms_fallback_url : undefined,
          }));
          return;
        }
      }
      // Un hoquet réseau ne doit JAMAIS renvoyer un membre existant sur le CTA
      // « Créez votre carte » : on garde la carte déjà affichée.
      setLoyalty((p) => (p.status === "has_card" ? p : { status: "needs_signup" }));
    } catch {
      setLoyalty((p) => (p.status === "has_card" ? p : { status: "needs_signup" }));
    }
  }, [order.customer_phone, firstName]);

  useEffect(() => {
    void lookupCard();
  }, [lookupCard]);

  // SOLIDIFICATION VISIBLE (F3) — quand la caisse fait changer le statut, le
  // tampon « en attente » devient acquis côté serveur ; on relit la carte pour
  // que le client le VOIE sans recharger la page.
  //
  // Piloté par order.status (un état), PAS depuis la callback de polling :
  // sur un statut terminal celle-ci appelle stop() qui ferme le canal, et un
  // rafraîchissement placé après n'aurait jamais lieu — le tampon en attente
  // resterait collé à l'écran après un refus.
  const statutPrecedent = useRef<string | null>(null);
  useEffect(() => {
    const precedent = statutPrecedent.current;
    statutPrecedent.current = order.status;
    // Premier passage = montage : la lecture initiale ci-dessus suffit.
    if (precedent === null || precedent === order.status) return;
    void lookupCard();
  }, [order.status, lookupCard]);

  async function createCard() {
    setLoyalty({ status: "signing_up" });
    try {
      const res = await fetch(`/api/rialto/loyalty/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName,
          last_name: order.customer_name.split(" ").slice(1).join(" ") || "",
          phone: order.customer_phone,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoyalty({
          status: "error",
          message: (body as { error?: string }).error ?? "Erreur serveur",
        });
        return;
      }
      const body = (await res.json()) as {
        customer: { id: string };
        card: {
          short_code: string | null;
          current_stamps: number;
          stamps_required: number;
          reward_description: string;
        };
        sms_sent?: boolean;
        sms_fallback_url?: string | null;
      };
      if (!body.card.short_code) {
        // Re-lookup pour récupérer le short_code (cas où le backfill vient
        // juste de se faire)
        await lookupCard();
        return;
      }
      writeCustomerSession({
        customer_id: body.customer.id,
        short_code: body.card.short_code,
        phone: order.customer_phone,
        first_name: firstName,
      });
      setLoyalty({
        status: "has_card",
        short_code: body.card.short_code,
        current_stamps: body.card.current_stamps,
        stamps_required: body.card.stamps_required,
        reward_description: body.card.reward_description,
        // La réponse d'inscription ne porte pas le dérivé : 0 transitoire,
        // complété juste après par lookupCard() (qui préserve les infos SMS).
        pending_stamps: 0,
        sms_sent: body.sms_sent !== false, // undefined ou true → considéré envoyé
        sms_fallback_url: body.sms_fallback_url ?? null,
      });
      // Récupère le tampon EN ATTENTE de la commande qui vient d'être passée :
      // un nouveau membre doit le voir immédiatement, c'est le moment où la
      // gratification compte le plus.
      void lookupCard();
    } catch (err) {
      setLoyalty({
        status: "error",
        message: err instanceof Error ? err.message : "Erreur réseau",
      });
    }
  }

  return (
    <main className="min-h-screen bg-white pb-20">
      {/* Bandeau célébration */}
      <section className="relative overflow-hidden bg-white py-14 md:py-20">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 30%, #C73E1D 1.5px, transparent 1.5px), radial-gradient(circle at 70% 80%, #E6A12C 1.5px, transparent 1.5px)",
            backgroundSize: "40px 40px, 60px 60px",
          }}
          aria-hidden
        />
        <div className="container-hero relative text-center">
          {isCancelled ? (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rialto/10">
              <svg
                width="36"
                height="36"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#C73E1D"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
          ) : (
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-rialto text-white shadow-pop animate-fade-up">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
          <h1 className="mt-6 font-display text-h1 font-bold">
            {isCancelled
              ? "Commande annulée"
              : `Merci ${firstName} !`}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base text-mute">
            {isCancelled ? (
              <>
                Votre commande {order.order_number} a été annulée. Pour toute
                question : {RIALTO_INFO.phoneDisplay}
              </>
            ) : (
              <>
                Votre commande{" "}
                <span className="font-semibold text-ink">
                  {order.order_number}
                </span>{" "}
                est enregistrée. Suivez sa progression en direct ci-dessous.
              </>
            )}
          </p>
        </div>
      </section>

      {/* Timeline */}
      {!isCancelled && (
        <section className="container-hero mt-10">
          <div className="mx-auto max-w-xl rounded-3xl border border-border bg-white p-6 shadow-card md:p-8">
            <h2 className="mb-6 font-display text-xl font-bold">
              Suivi de la commande
            </h2>
            {etaLabel && !isCancelled && (
              <p className="mb-4 rounded-xl bg-white p-3 text-sm text-ink">
                <span aria-hidden="true">🕒</span>{" "}
                {fulfillment === "pickup"
                  ? etaLabel.startsWith("d'une")
                    ? "Prête" // « Prête d'une minute à l'autre » — pas « dans »
                    : "Prête dans"
                  : "Livraison estimée"}{" "}
                <strong>{etaLabel}</strong>
              </p>
            )}
            <ol className="space-y-4">
              {steps.map((step, idx) => {
                const done = idx <= currentStep;
                const current = idx === currentStep;
                // La dernière étape ne peut plus dire « Le livreur est en
                // route » une fois le trajet fini : texte périmé = bug.
                // Mais la formulation doit distinguer ce qu'on SAIT de ce
                // qu'on ESTIME (doctrine Augustin, la raison même du
                // retrait de l'étape « Livrée ») :
                //   · le client a TAPÉ → il l'a dit, on peut l'affirmer ;
                //   · seule l'horloge a tourné → conditionnel obligatoire.
                const arrivee =
                  step.key === "delivering" && phase.key === "delivered";
                const description = arrivee
                  ? tapEffectue
                    ? "Votre commande est arrivée."
                    : "Votre commande devrait être arrivée."
                  : step.description;
                // Le LIBELLÉ bouge avec la description. Sans ça, le titre en
                // gras disait « Votre commande arrive » juste au-dessus de
                // « Votre commande est arrivée. » — deux lignes qui se
                // touchent et se contredisent, à une lettre près. Illisible
                // pour une clientèle qui ne lit pas couramment le français.
                const label = arrivee
                  ? tapEffectue
                    ? "Commande arrivée"
                    : "Livraison"
                  : step.label;
                return (
                  <li key={step.key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition ${
                          done
                            ? "border-rialto bg-rialto text-white"
                            : "border-border bg-white text-mute"
                        } ${current ? "animate-pulse-ring" : ""}`}
                      >
                        {done ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <span className="tabular text-xs font-semibold">
                            {idx + 1}
                          </span>
                        )}
                      </div>
                      {idx < steps.length - 1 && (
                        <div
                          className={`mt-1 h-full w-0.5 ${
                            done ? "bg-rialto" : "bg-border"
                          }`}
                        />
                      )}
                    </div>
                    <div className="pb-4">
                      <div
                        className={`font-display font-semibold ${
                          done ? "text-ink" : "text-mute"
                        }`}
                      >
                        {label}
                      </div>
                      <div className="text-sm text-mute">
                        {description}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {/* TAP CLIENT (chantier recalibrage, GO 18.08) : vérité
                terrain d'un seul geste — calibration + clôture + moment
                naturel de la demande d'avis. Affiché dès « En livraison »
                (pas seulement après « Livrée ») : sinon on ne capture
                jamais les livraisons EN AVANCE et le calibrage est biaisé
                vers le lent par construction (correction 4 du GO). */}
            {tapEtat === "non" &&
              tapDansLaFenetre &&
              (fulfillment === "delivery"
                ? phase.key === "delivering" || phase.key === "delivered"
                : phase.key === "ready") && (
                <div className="mt-5 rounded-2xl border border-border bg-white p-4 text-sm">
                  <p className="font-semibold text-ink">
                    <span aria-hidden="true">📦</span>{" "}
                    {fulfillment === "delivery"
                      ? "Votre commande est arrivée ?"
                      : "Commande bien récupérée ?"}
                  </p>
                  <button
                    type="button"
                    onClick={() => void confirmeArrivee()}
                    disabled={tapEnvoi}
                    className="btn-primary mt-3 w-full justify-center disabled:opacity-50"
                  >
                    {tapEnvoi
                      ? "…"
                      : fulfillment === "delivery"
                        ? "Oui, bien reçue !"
                        : "Oui, récupérée !"}
                  </button>
                  {tapErreur && (
                    <p className="mt-2 text-xs text-rialto">⚠️ {tapErreur}</p>
                  )}
                </div>
              )}
            {tapEffectue && (
              <p className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <span aria-hidden="true">✅</span> Merci ! Bon appétit.
              </p>
            )}

            {/* Gate avis (14.08.2026) : entrée post-commande du flux —
                on demande UN avis (jamais « positif »), la roue est une
                CHANCE de gagner (garde-fous décision Augustin). LIVRAISON :
                affiché une fois « Livrée » — le tap y mène naturellement
                (confirmer la remise fait passer la phase, le CTA apparaît
                dans le même geste). RETRAIT : « Prête » précède le
                passage au comptoir — le CTA n'apparaît qu'APRÈS le tap
                « bien récupérée » (relecture 18.08 : sinon on demandait
                un avis avant la remise, le travers du 14.08). */}
            {(fulfillment === "delivery"
              ? phase.key === "delivered" || phase.key === "ready"
              : tapEffectue) && (
              <div className="mt-5 rounded-2xl border border-saffron/40 bg-saffron/10 p-4 text-sm">
                <p className="font-semibold text-ink">
                  <span aria-hidden="true">⭐</span> Votre avis compte
                </p>
                <p className="mt-1 text-ink/80">
                  Partagez votre expérience sur Google et tentez votre
                  chance à la roue Rialto.
                </p>
                <Link
                  href="/rialto-club/roue"
                  className="mt-3 inline-block font-medium text-rialto underline"
                >
                  Laisser mon avis et tourner la roue →
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Récap */}
      <section className="container-hero mt-10">
        <div className="mx-auto max-w-xl rounded-3xl border border-border bg-white p-6 shadow-card md:p-8">
          <h2 className="font-display text-xl font-bold">Votre commande</h2>
          <ul className="mt-4 divide-y divide-border">
            {/* Phase 9 FIX 3 : fallback défensif si items absent (cas
                théorique où un merge partiel les aurait perdus) */}
            {(order.items ?? []).map((it, i) => (
              <li key={i} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-display font-semibold text-ink">
                    {it.quantity}&nbsp;×&nbsp;{it.item_name_snapshot}
                  </div>
                  {it.selected_options.length > 0 && (
                    <div className="mt-0.5 text-xs text-mute">
                      {it.selected_options.map((o) => o.name).join(", ")}
                    </div>
                  )}
                </div>
                <span className="tabular shrink-0 font-display text-sm font-semibold">
                  {formatCHF(Number(it.subtotal))}
                </span>
              </li>
            ))}
          </ul>

          <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-mute">Livraison</dt>
              <dd className="font-medium">
                {order.delivery_address}, {order.delivery_postal_code}{" "}
                {order.delivery_city}
              </dd>
            </div>
            <div className="flex justify-between font-display text-base font-bold">
              {/* Une commande annulée ne se règle pas. Afficher « Total à
                  régler au livreur » à 400 px du bandeau « Commande
                  annulée » réclamerait de l'argent pour rien — exactement
                  le genre d'affirmation fausse que ce lot a retiré ailleurs. */}
              <dt>
                {isCancelled ? "Montant de la commande annulée" : "Total à régler au livreur"}
              </dt>
              <dd className="tabular">{formatCHF(Number(order.total_amount))}</dd>
            </div>
          </dl>

          {!isCancelled && (
            <div className="mt-6 rounded-xl bg-saffron/15 p-4 text-sm text-ink">
              <span className="font-semibold">💶 Paiement au livreur.</span>{" "}
              Cash, TWINT ou carte bancaire acceptés.
            </div>
          )}
        </div>
      </section>

      {/* ─── Carte fidélité — SECTION PROMINENTE (placée avant le récap) ── */}
      {!isCancelled && (
        <section className="container-hero mt-10">
          <div className="mx-auto max-w-xl">
            <LoyaltyCardSection
              loyalty={loyalty}
              firstName={firstName}
              phone={order.customer_phone}
              onCreate={createCard}
            />
          </div>
        </section>
      )}

      {/* Actions retour */}
      <section className="container-hero mt-8">
        <div className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row">
          {/* « Retour à l'accueil » retiré (21.08) : pour un client
              qualifié — et il l'est forcément ici, il vient de commander
              — la home rebondit vers /menu, donc ce bouton faisait
              doublon avec « Voir le menu » juste à côté. */}
          <Link href="/menu" className="btn-ghost flex-1">
            Voir le menu
          </Link>
        </div>
      </section>
    </main>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   Section carte fidélité — UI proéminente one-click
   ═══════════════════════════════════════════════════════════════════════ */
function LoyaltyCardSection({
  loyalty,
  firstName,
  phone,
  onCreate,
}: {
  loyalty: LoyaltyCardState;
  firstName: string;
  phone: string;
  onCreate: () => void;
}) {
  // Barème lu à la source (F4) : ce bloc décrit la fidélité à des clients qui
  // n'ont pas encore de carte, donc AVANT tout lookup — il ne peut pas se
  // contenter des chiffres renvoyés par la carte. Requête déclenchée
  // UNIQUEMENT sur la branche qui l'affiche (les autres sortent plus bas).
  const publicRule = useStampRule(loyalty.status === "needs_signup");

  // Masque le numéro pour l'affichage (+41 79 *** 45 67 → +41 79 XX XX 67)
  const phoneMasked = phone
    ? phone.replace(/(\+?\d{2,3})(\d+)(\d{2})$/, "$1 ... $3")
    : "";

  if (loyalty.status === "idle" || loyalty.status === "checking") {
    return (
      <div className="rounded-3xl border border-border bg-white p-6 shadow-card md:p-8">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-full bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-neutral-100" />
            <div className="h-3 w-48 animate-pulse rounded bg-neutral-100" />
          </div>
        </div>
      </div>
    );
  }

  if (loyalty.status === "has_card") {
    const cardUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/c/${loyalty.short_code}`;
    return (
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-rialto to-rialto-dark p-6 text-white shadow-pop md:p-8">
        <span className="eyebrow !text-saffron">Votre carte fidélité</span>
        <h3 className="mt-3 font-display text-2xl font-bold leading-tight md:text-3xl">
          {loyalty.current_stamps} tampon
          {loyalty.current_stamps > 1 ? "s" : ""} sur{" "}
          {loyalty.stamps_required}
        </h3>
        <p className="mt-1 text-sm text-white/85">
          {loyalty.stamps_required - loyalty.current_stamps > 0
            ? `Encore ${loyalty.stamps_required - loyalty.current_stamps} pour ${loyalty.reward_description.toLowerCase()}.`
            : `🎉 Carte complète ! ${loyalty.reward_description} à récupérer.`}
        </p>
        {/* Pastilles + ligne texte : MÊME composant que la section Fidélité.
            Remplace l'ancienne barre de progression, qui ne pouvait pas
            représenter un tampon « en attente » — c'est précisément ce qui
            manquait ici, sur la surface où le client arrive après avoir payé. */}
        <div className="mt-4">
          <StampRow
            currentStamps={loyalty.current_stamps}
            stampsRequired={loyalty.stamps_required}
            pendingStamps={loyalty.pending_stamps}
            tone="dark"
          />
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <a
            href={cardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-white px-5 py-3.5 text-sm font-semibold text-rialto transition hover:bg-neutral-50"
          >
            Afficher mon QR code
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
          </a>
        </div>
        <p className="mt-3 text-center text-[11px] text-white/60">
          Code : <span className="font-mono font-semibold text-white/90">{loyalty.short_code}</span>
        </p>

        {/* Phase 10 C2D : fallback si SMS non envoyé (crédits Brevo KO) */}
        {loyalty.sms_sent === false && (
          <div className="mt-4 rounded-2xl bg-white/10 p-3 text-center text-[11px] text-white/90">
            <div className="font-semibold">💡 Gardez ce lien en favori</div>
            <p className="mt-0.5 text-white/75">
              Vous n&apos;avez pas reçu de SMS ? Copiez ce lien pour retrouver
              votre carte fidélité plus tard :
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={cardUrl}
                className="flex-1 rounded-lg bg-white/15 px-2 py-1.5 font-mono text-[10px] text-white"
                onClick={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={() => {
                  try {
                    navigator.clipboard.writeText(cardUrl);
                  } catch {
                    /* ignore */
                  }
                }}
                className="rounded-lg bg-white px-2 py-1.5 text-[10px] font-semibold text-rialto hover:bg-neutral-50"
              >
                Copier
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (loyalty.status === "signing_up") {
    return (
      <div className="rounded-3xl border-2 border-rialto bg-rialto/5 p-6 text-center md:p-8">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rialto text-white">
          <svg
            className="animate-spin"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        </div>
        <h3 className="font-display text-xl font-bold">
          Création de votre carte…
        </h3>
        <p className="mt-1 text-sm text-mute">
          Nous vous envoyons votre QR par SMS dans quelques secondes.
        </p>
      </div>
    );
  }

  if (loyalty.status === "error") {
    return (
      <div className="rounded-3xl border border-rialto/30 bg-rialto/10 p-6">
        <h3 className="font-display text-lg font-semibold text-rialto">
          Erreur
        </h3>
        <p className="mt-1 text-sm text-ink/80">{loyalty.message}</p>
        <button
          type="button"
          onClick={onCreate}
          className="btn-primary mt-3"
        >
          Réessayer
        </button>
      </div>
    );
  }

  // needs_signup
  return (
    <div className="relative overflow-hidden rounded-3xl border-2 border-rialto bg-cream p-6 text-ink shadow-pop md:p-8">
      {/* Badge d'intro */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 text-3xl">🎴</div>
        <div>
          <span className="eyebrow">Profitez de vos avantages Rialto</span>
          <h3 className="mt-2 font-display text-xl font-bold leading-tight md:text-2xl">
            Créez votre carte fidélité{" "}
            <em className="italic text-rialto">en 1 clic</em>
          </h3>
          <p className="mt-1.5 text-sm text-mute">
            1 tampon offert tout de suite.{" "}
            {publicRule
              ? `Ensuite, ${publicRule.rule.label}. ${publicRule.goal.label}.`
              : "Cumulez ensuite des tampons sur vos commandes."}
          </p>
        </div>
      </div>

      {/* Bénéfices */}
      <ul className="mt-5 space-y-2 text-sm">
        <li className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
            ✓
          </span>
          <span className="text-ink">
            {publicRule
              ? publicRule.goal.label
              : "Une récompense quand votre carte est complète"}
          </span>
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
            ✓
          </span>
          <span className="text-ink">Tour de roue chaque mois</span>
        </li>
        <li className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
            ✓
          </span>
          <span className="text-ink">Offres spéciales anniversaire</span>
        </li>
      </ul>

      {/* CTA one-click : réutilise le téléphone de la commande */}
      <button
        type="button"
        onClick={onCreate}
        className="btn-primary-lg mt-6 w-full"
      >
        🎴 Créer ma carte avec {phoneMasked || "ce numéro"}
      </button>

      <p className="mt-2 text-center text-[11px] text-mute">
        Gratuit · aucune carte plastique · juste un QR code à montrer
      </p>
    </div>
  );
}
