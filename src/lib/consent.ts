/**
 * Consentement cookies — SOURCE UNIQUE (Lot B tracking, 23.07.2026).
 *
 * Trois consommateurs : le bandeau (CookieBanner), le chargement des tags
 * (GoogleAnalytics aujourd'hui, TrackingProvider au Lot C), et le lien
 * « Gérer les cookies » (/privacy + menu) qui permet le RETRAIT — exigence
 * de base nLPD/PFPDT, absente jusqu'ici.
 *
 * ⚠️ CLÉ VERSIONNÉE (`_v2`) : l'ancien bandeau ne mentionnait que « Google
 * Analytics anonymisé ». Un « accepted » stocké sous cet ancien libellé ne
 * peut PAS couvrir Meta Pixel et Google Ads : le périmètre du consentement
 * a changé, donc tout le monde re-consent sous le nouveau texte. L'ancienne
 * clé est ignorée (pas lue, pas migrée) et nettoyée au passage.
 *
 * Support : localStorage. Limite documentée et assumée : le choix est
 * redemandé entre Safari et la PWA installée iOS (jarres isolées — même
 * comportement que le reste du site, cf. DonneesClient).
 */

export type Consent = "accepted" | "rejected" | null;

const STORAGE_KEY = "rialto_cookie_consent_v2";
const LEGACY_KEY = "rialto_cookie_consent";
/** CustomEvent émis à chaque changement (même onglet — storage ne suffit pas). */
const EVENT = "rialto:consent-change";

export function getConsent(): Consent {
  if (typeof window === "undefined") return null;
  try {
    // Nettoyage silencieux de l'ancienne clé (périmètre caduc).
    if (localStorage.getItem(LEGACY_KEY) !== null) {
      localStorage.removeItem(LEGACY_KEY);
    }
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "accepted" || v === "rejected" ? v : null;
  } catch {
    return null;
  }
}

export function setConsent(value: Exclude<Consent, null>): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* stockage indisponible : le choix ne persiste pas, le bandeau reviendra */
  }
  emit(value);
}

/**
 * RETRAIT : efface le choix et rouvre le bandeau. Le retrait vaut refus
 * immédiat côté tags (les consommateurs traitent null comme "rejected").
 */
export function resetConsent(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
  emit(null);
}

function emit(value: Consent): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<Consent>(EVENT, { detail: value }));
}

/** Abonnement aux changements (retourne la fonction de désabonnement). */
export function onConsentChange(cb: (value: Consent) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => cb((e as CustomEvent<Consent>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
