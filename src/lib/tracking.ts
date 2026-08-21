"use client";

/**
 * Tracking publicitaire — SOURCE UNIQUE des événements (Lot C, 23.07.2026).
 *
 * Fan-out vers gtag (GA4 + Google Ads plus tard) ET fbq (Meta Pixel), avec
 * un principe non négociable : RIEN ne part sans consentement (socle Lot B).
 *
 * MACHINE À ÉTATS :
 *   'pending'  — pas encore de choix : les événements FUNNEL sont mis en
 *                FILE D'ATTENTE (bornée) et rejoués à l'acceptation ; les
 *                pageviews sont ABANDONNÉS (le config/snippet initial envoie
 *                déjà une PV au moment de l'acceptation — les rejouer
 *                doublerait la page courante).
 *   'granted'  — scripts injectés, événements directs, file rejouée.
 *   'denied'   — file vidée, tout événement est jeté, zéro appel réseau.
 *
 * CONSENT MODE V2 (mode basic) : les états `consent default denied` sont
 * poussés dans dataLayer AVANT le chargement de gtag.js, puis `update
 * granted` — requis par la politique consentement UE de Google (qui couvre
 * la Suisse) ; sans les signaux ad_user_data/ad_personalization, les
 * audiences Google Ads seraient rejetées. En mode basic, le script n'est
 * même pas chargé avant acceptation : aucun ping cookieless.
 *
 * ORDRE D'INJECTION : tout est fait impérativement dans grantTracking() —
 * stub gtag + consent default → update granted → js → config PUIS append
 * du <script> distant.
 * gtag.js rejoue dataLayer dans l'ordre : le consent default est
 * structurellement lu en premier, aucune course possible (le piège
 * documenté du plan : deux <Script> next/script ne garantissent pas cet
 * ordre).
 *
 * RETRAIT en cours de session : état 'denied' + `consent update denied` —
 * plus aucun tir. Limite documentée : un script déjà chargé dans l'onglet
 * ne peut pas être déchargé ; au prochain chargement de page, rien ne
 * charge.
 *
 * ⚠️ cookie_expires 33 696 000 s (390 j) : TIENT la promesse « 13 mois »
 * écrite dans /privacy (défaut GA = 2 ans). Ne pas retirer.
 */

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID; // absent en v1 (import GA4)

const CURRENCY = "CHF";
/** Borne de la file : au-delà, on jette le plus ancien (jamais de croissance infinie). */
const QUEUE_MAX = 20;

type Status = "pending" | "granted" | "denied";

let status: Status = "pending";
let injected = false;
// conversion=true marque les événements IRREMPLAÇABLES (purchase) : la
// file est en mémoire pure, un rechargement la détruit — PwaRegister
// consulte conversionEnAttente() pour ne jamais recharger tant qu'une
// conversion attend le consentement (refonte SW silencieuse 17.08).
const queue: Array<{ fire: () => void; conversion: boolean }> = [];

/* ─── Types minimaux des globals injectés ──────────────────────────────── */
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & {
      callMethod?: (...args: unknown[]) => void;
      queue?: unknown[];
      push?: unknown;
      loaded?: boolean;
      version?: string;
    };
    _fbq?: unknown;
  }
}

function appendScript(src: string): void {
  const s = document.createElement("script");
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

/* ─── Cycle de vie (appelé par TrackingProvider) ───────────────────────── */

export function grantTracking(): void {
  if (typeof window === "undefined") return;
  status = "granted";
  if (!injected) {
    injected = true;

    // ── Google : stub + Consent Mode v2 AVANT le script distant ──
    window.dataLayer = window.dataLayer || [];
    // ⚠️ Le stub DOIT pousser l'objet `arguments`, PAS un Array (...args) :
    // gtag.js ignore silencieusement les commandes poussées en tableau.
    // Constaté en QA prod : dataLayer visuellement correct, mais état de
    // consentement interne vide (ics usedDefault:false) → aucun config
    // traité, pas de cookie _ga, aucun beacon /g/collect. fbevents.js,
    // lui, accepte les tableaux — d'où Meta qui partait quand même.
    const gtag: (...args: unknown[]) => void = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag = gtag;
    gtag("consent", "default", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    // L'update granted précède le config : en Consent Mode, un config
    // évalué sous « denied » retient sa page_view initiale. L'update est
    // AUSSI rejoué hors du bloc, pour le cycle retrait → ré-acceptation.
    gtag("consent", "update", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "granted",
    });
    gtag("js", new Date());
    // ⚠️ `config` émet la page_view INITIALE avec l'URL réelle — exactement
    // le cas du lien de confirmation ouvert à froid depuis l'email, jeton
    // compris. On impose donc l'URL rédigée dès l'initialisation ; sans ça,
    // la rédaction de `track.pageView` ne couvrirait que les navigations
    // internes et laisserait fuir la seule qui compte.
    const { href: pageLocation, path: pagePath } = urlSansSecret();
    if (GA_ID) {
      gtag("config", GA_ID, {
        cookie_expires: 33696000,
        page_location: pageLocation,
        page_path: pagePath,
      });
    }
    if (ADS_ID) {
      gtag("config", ADS_ID, { page_location: pageLocation });
    }
    if (GA_ID || ADS_ID) {
      appendScript(
        `https://www.googletagmanager.com/gtag/js?id=${GA_ID ?? ADS_ID}`,
      );
    }

    // ── Meta : stub fbq (équivalent du snippet officiel) + init ──
    if (META_PIXEL_ID) {
      if (!window.fbq) {
        const fbq: NonNullable<Window["fbq"]> = (...args: unknown[]) => {
          if (fbq.callMethod) {
            fbq.callMethod(...args);
          } else {
            fbq.queue!.push(args);
          }
        };
        fbq.queue = [] as unknown[];
        fbq.push = fbq;
        fbq.loaded = true;
        fbq.version = "2.0";
        window.fbq = fbq;
        window._fbq = fbq;
        appendScript("https://connect.facebook.net/en_US/fbevents.js");
      }
      window.fbq!("init", META_PIXEL_ID);
      window.fbq!("track", "PageView");
    }
  }

  // ⚠️ HORS du bloc if(!injected), et à CHAQUE grant : après un cycle
  // accepté → retrait → ré-accepté, l'injection est déjà faite mais le
  // retrait a poussé `consent update denied` — sans ce rejeu, les signaux
  // resteraient coupés pour tout le reste de la session.
  window.gtag?.("consent", "update", {
    ad_storage: "granted",
    ad_user_data: "granted",
    ad_personalization: "granted",
    analytics_storage: "granted",
  });
  window.fbq?.("consent", "grant");

  // Rejoue les événements funnel accumulés avant le choix.
  while (queue.length > 0) {
    const entree = queue.shift();
    entree?.fire();
  }
}

/**
 * Une CONVERSION (purchase) attend le consentement dans la file MÉMOIRE.
 * Consommé par PwaRegister : aucun rechargement de mise à jour SW tant
 * que c'est vrai — la file ne survit pas à un reload et le purchase ne
 * se rejoue jamais. Conséquence assumée : un client qui commande sans
 * jamais trancher le bandeau cookies garde l'ancienne version pour le
 * reste de sa session (on préfère perdre la mise à jour que la
 * conversion).
 */
export function hasPendingConversion(): boolean {
  return status === "pending" && queue.some((e) => e.conversion);
}

export function denyTracking(): void {
  status = "denied";
  queue.length = 0;
  // Défense en profondeur si les scripts avaient déjà été chargés dans
  // l'onglet (retrait en cours de session) : signaux coupés des DEUX côtés.
  if (typeof window !== "undefined" && injected) {
    window.gtag?.("consent", "update", {
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
      analytics_storage: "denied",
    });
    window.fbq?.("consent", "revoke");
  }
}

/** Retrait / pas encore de choix : on bufferise à nouveau (bandeau rouvert). */
export function suspendTracking(): void {
  if (status === "granted") {
    // Un retrait explicite passe par denyTracking via le provider ; ici on
    // revient à l'état d'attente (nouveau bandeau, nouveau choix à venir).
    denyTracking();
  }
  status = "pending";
}

/* ─── Émission ─────────────────────────────────────────────────────────── */

function emit(
  fire: () => void,
  queueable: boolean,
  conversion = false,
): void {
  if (typeof window === "undefined") return;
  if (status === "granted") {
    fire();
    return;
  }
  if (status === "pending" && queueable) {
    if (queue.length >= QUEUE_MAX) {
      // Ne jamais évincer une conversion au profit d'un événement banal.
      const indexBanal = queue.findIndex((e) => !e.conversion);
      if (indexBanal >= 0) queue.splice(indexBanal, 1);
      else if (!conversion) return; // file pleine de conversions : jeté
      else queue.shift();
    }
    queue.push({ fire, conversion });
  }
  // 'denied' (ou pageview en attente) : jeté, zéro appel réseau.
}

export type TrackedItem = {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  category?: string | null;
};

function gaItems(items: TrackedItem[]) {
  return items.map((i) => ({
    item_id: i.id,
    item_name: i.name,
    price: i.price,
    quantity: i.quantity ?? 1,
    ...(i.category ? { item_category: i.category } : {}),
  }));
}

/**
 * ⚠️ NE JAMAIS ENVOYER UNE URL DE COMMANDE TELLE QUELLE À UN TIERS.
 *
 * Depuis le 21.08, `/confirmation/<numéro>` porte un JETON d'accès en
 * paramètre (`?t=…`). Envoyer l'URL brute publierait chez un tiers le
 * secret qu'on vient de mettre en place — et un lien ouvert depuis l'email
 * est justement le cas où l'URL complète est présente.
 *
 * ⚠️ CETTE RÉDACTION NE COUVRE QUE GOOGLE, PAS META. `page_location` et
 * `page_path` sont des paramètres gtag ; `fbevents.js` construit son
 * paramètre `dl` à partir de `document.location.href`, sans que rien ne
 * puisse le surcharger. **Le jeton part donc encore chez Meta à chaque
 * ouverture de la page de suivi.** Ne pas écrire le contraire tant que ce
 * n'est pas réglé — la seule vraie solution est de sortir le jeton de
 * l'URL (échange contre un cookie httpOnly puis redirection vers l'URL
 * nue), ou de ne pas injecter le pixel Meta sur /confirmation.
 * Correction du 21.08 : le message du commit `cce3b1c` annonçait
 * « Google et Meta ». La moitié Meta était fausse.
 *
 * Bénéfice secondaire acquis : la cardinalité des pages GA4 reste lisible
 * (une ligne « /confirmation » au lieu d'une par commande).
 */
function urlSansSecret(): { href: string; path: string } {
  const path = window.location.pathname;
  if (path.startsWith("/confirmation/")) {
    return { href: `${window.location.origin}/confirmation`, path: "/confirmation" };
  }
  // Ailleurs, on garde l'URL réelle mais jamais la query : rien n'en a
  // besoin pour l'analytics, et c'est là que vivent les secrets.
  return { href: `${window.location.origin}${path}`, path };
}

export const track = {
  /** Navigation SPA (l'initiale est couverte par config/snippet). NON bufferisé. */
  pageView(): void {
    emit(() => {
      const { href, path } = urlSansSecret();
      window.gtag?.("event", "page_view", {
        page_location: href,
        page_path: path,
      });
      window.fbq?.("track", "PageView");
    }, false);
  },

  viewItem(item: TrackedItem): void {
    emit(() => {
      window.gtag?.("event", "view_item", {
        currency: CURRENCY,
        value: item.price,
        items: gaItems([item]),
      });
      window.fbq?.("track", "ViewContent", {
        content_ids: [item.id],
        content_name: item.name,
        content_type: "product",
        value: item.price,
        currency: CURRENCY,
      });
    }, true);
  },

  addToCart(item: TrackedItem): void {
    const qty = item.quantity ?? 1;
    emit(() => {
      window.gtag?.("event", "add_to_cart", {
        currency: CURRENCY,
        value: item.price * qty,
        items: gaItems([item]),
      });
      window.fbq?.("track", "AddToCart", {
        content_ids: [item.id],
        content_name: item.name,
        content_type: "product",
        value: item.price * qty,
        currency: CURRENCY,
      });
    }, true);
  },

  beginCheckout(payload: { value: number; items: TrackedItem[] }): void {
    emit(() => {
      window.gtag?.("event", "begin_checkout", {
        currency: CURRENCY,
        value: payload.value,
        items: gaItems(payload.items),
      });
      window.fbq?.("track", "InitiateCheckout", {
        value: payload.value,
        currency: CURRENCY,
        num_items: payload.items.reduce((n, i) => n + (i.quantity ?? 1), 0),
      });
    }, true);
  },

  /**
   * Commande confirmée. `orderNumber` sert de transaction_id (GA4) ET
   * d'eventID (Meta) : la déduplication CAPI est plug-and-play le jour où
   * elle sera ajoutée (décision : pas en v1, rendez-vous octobre).
   * La VALEUR est le total REMISÉ réellement payé (décision produit).
   */
  purchase(payload: {
    orderNumber: string;
    value: number;
    items: TrackedItem[];
  }): void {
    emit(() => {
      window.gtag?.("event", "purchase", {
        transaction_id: payload.orderNumber,
        currency: CURRENCY,
        value: payload.value,
        items: gaItems(payload.items),
      });
      window.fbq?.(
        "track",
        "Purchase",
        {
          content_ids: payload.items.map((i) => i.id),
          content_type: "product",
          value: payload.value,
          currency: CURRENCY,
          num_items: payload.items.reduce((n, i) => n + (i.quantity ?? 1), 0),
        },
        { eventID: payload.orderNumber },
      );
    }, true, true);
  },
};
