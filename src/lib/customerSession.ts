/**
 * Session client légère côté navigateur — pas d'auth Supabase, juste
 * un marqueur localStorage indiquant si le visiteur a déjà créé une
 * carte Rialto Club.
 *
 * Stocké lors du signup (checkout success ou /rialto-club/join) et lu
 * par le HamburgerMenu pour afficher la bonne liste de liens.
 */

const KEY_CUSTOMER_ID = "rialto_customer_id";
const KEY_SHORT_CODE = "rialto_customer_card_short_code";
const KEY_PHONE = "rialto_customer_phone";
const KEY_FIRST_NAME = "rialto_customer_first_name";

export type CustomerSession = {
  customer_id: string;
  short_code: string;
  phone: string;
  first_name: string;
};

export function readCustomerSession(): CustomerSession | null {
  if (typeof window === "undefined") return null;
  const customer_id = window.localStorage.getItem(KEY_CUSTOMER_ID);
  const short_code = window.localStorage.getItem(KEY_SHORT_CODE);
  const phone = window.localStorage.getItem(KEY_PHONE);
  const first_name = window.localStorage.getItem(KEY_FIRST_NAME);
  if (!customer_id || !short_code || !phone) return null;
  return {
    customer_id,
    short_code,
    phone,
    first_name: first_name ?? "",
  };
}

export function writeCustomerSession(s: CustomerSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY_CUSTOMER_ID, s.customer_id);
  window.localStorage.setItem(KEY_SHORT_CODE, s.short_code);
  window.localStorage.setItem(KEY_PHONE, s.phone);
  if (s.first_name) {
    window.localStorage.setItem(KEY_FIRST_NAME, s.first_name);
  }
  window.dispatchEvent(new CustomEvent("rialto:session-updated"));
}

export function clearCustomerSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY_CUSTOMER_ID);
  window.localStorage.removeItem(KEY_SHORT_CODE);
  window.localStorage.removeItem(KEY_PHONE);
  window.localStorage.removeItem(KEY_FIRST_NAME);
  window.dispatchEvent(new CustomEvent("rialto:session-updated"));
}
