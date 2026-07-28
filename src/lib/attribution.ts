"use client";

/**
 * Attribution marketing — capture et persistance des UTM (Lot F, 24.07.2026).
 *
 * MODÈLE : last-touch non-direct, fenêtre 30 jours. La dernière visite
 * porteuse d'UTM (ou, à défaut, d'un referrer externe) écrase la
 * précédente ; une visite directe (ni UTM ni referrer externe) ne touche
 * à RIEN — elle ne doit pas effacer le « venu par la pub Meta » d'il y a
 * trois jours. À la commande, le snapshot part dans le POST /api/orders
 * et finit dans orders.attribution (migration TR1).
 *
 * POSTURE nLPD (documentée pour la review) : donnée STRICTEMENT first-party
 * — aucun tiers appelé, aucun cookie tiers, pas de recoupement cross-site ;
 * c'est le « comment nous avez-vous connu ? » du commerçant, stocké dans le
 * navigateur du client puis sur SA commande. Capture indépendante du
 * consentement cookies (qui couvre les tags Google/Meta, pas ceci).
 *
 * Limite PWA connue et assumée : jarre localStorage séparée entre Safari
 * et la PWA installée iOS (même comportement que le panier).
 */

const STORAGE_KEY = "rialto_attribution_v1";
/** Fenêtre de validité du last-touch. */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Anti-déchet : borne dure sur chaque valeur captée. */
const MAX_LEN = 200;

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type Attribution = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  /** Hôte externe de provenance (jamais le nôtre). */
  referrer?: string;
  /** Chemin d'atterrissage de la visite captée. */
  landing?: string;
  captured_at: string;
};

function clean(v: string | null): string | undefined {
  const t = (v ?? "").trim();
  if (!t) return undefined;
  return t.slice(0, MAX_LEN);
}

/**
 * À appeler au chargement de page (TrackingProvider). Capture si la visite
 * porte des UTM ou un referrer externe ; sinon ne touche à rien.
 */
export function captureAttribution(): void {
  if (typeof window === "undefined") return;
  try {
    const params = new URLSearchParams(window.location.search);
    const utm: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
    for (const k of UTM_KEYS) {
      const v = clean(params.get(k));
      if (v) utm[k] = v;
    }

    let referrer: string | undefined;
    if (document.referrer) {
      try {
        const host = new URL(document.referrer).hostname;
        if (host && host !== window.location.hostname) referrer = clean(host);
      } catch {
        /* referrer illisible : ignoré */
      }
    }

    // Visite directe : on ne touche à rien (cf. en-tête).
    if (Object.keys(utm).length === 0 && !referrer) return;

    const snapshot: Attribution = {
      ...utm,
      ...(referrer ? { referrer } : {}),
      landing: clean(window.location.pathname),
      captured_at: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* stockage indisponible : l'attribution est perdue, jamais bloquante */
  }
}

/** Snapshot courant (null si rien de capté ou fenêtre expirée). */
export function readAttribution(): Attribution | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    if (!parsed?.captured_at) return null;
    const age = Date.now() - new Date(parsed.captured_at).getTime();
    if (!Number.isFinite(age) || age > MAX_AGE_MS) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
