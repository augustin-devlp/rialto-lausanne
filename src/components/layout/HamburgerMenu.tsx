"use client";

/**
 * Menu sidebar global — refonte UI lot 1 (20.08) : le bouton vit
 * désormais DANS l'AppHeader (prop `inline`), le panneau glisse depuis
 * la GAUCHE (cohérent avec la position du burger, ordre Uber Eats), et
 * le SÉLECTEUR DE LANGUES y est intégré (il flottait par-dessus le
 * burger — littéralement incliquable). L'i18n arrive au lot 3 : seule
 * la langue courante est active, les autres sont affichées « bientôt »
 * et INACTIVES — le sélecteur ne promet rien qu'il ne tient pas.
 *
 * Détection "connecté" : lit rialto_customer_id/short_code en localStorage.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cartCount, readCart } from "@/lib/clientStore";
import {
  clearCustomerSession,
  readCustomerSession,
  type CustomerSession,
} from "@/lib/customerSession";
import { RIALTO_INFO } from "@/lib/rialto-data";
import ManageCookiesButton from "@/components/analytics/ManageCookiesButton";
import { useT } from "@/i18n/I18nProvider";
import { LOCALE_META, LOCALES, type Locale } from "@/i18n/dictionaries";

export default function HamburgerMenu({ inline = false }: { inline?: boolean }) {
  const [open, setOpen] = useState(false);
  const [cartItems, setCartItems] = useState(0);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [languesOuvertes, setLanguesOuvertes] = useState(false);
  const { locale } = useT();
  const pathname = usePathname();

  // Ferme automatiquement quand on navigue
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const syncCart = () => setCartItems(cartCount(readCart()));
    const syncSession = () => setSession(readCustomerSession());
    syncCart();
    syncSession();
    window.addEventListener("rialto:cart-updated", syncCart);
    window.addEventListener("rialto:session-updated", syncSession);
    return () => {
      window.removeEventListener("rialto:cart-updated", syncCart);
      window.removeEventListener("rialto:session-updated", syncSession);
    };
  }, []);

  // Empêche le scroll du body quand le menu est ouvert
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Bouton hamburger : inline (dans l'AppHeader — l'usage normal
          depuis la refonte) ou l'ancien flottant fixed (compat). */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          inline
            ? "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-btn text-ink transition hover:bg-neutral-100"
            : "fixed right-4 top-4 z-[100] inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 shadow-card backdrop-blur-lg transition hover:scale-105 hover:bg-white md:right-5 md:top-5"
        }
        aria-label="Ouvrir le menu"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1A1A1A"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Overlay sombre — z-[90] pour être sous le hamburger mais au-dessus du reste */}
      <div
        className={`fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Sidebar — glisse depuis la GAUCHE (côté du burger, refonte 20.08) */}
      <aside
        className={`fixed inset-y-0 left-0 z-[95] flex w-[85vw] max-w-[340px] flex-col overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-hidden={!open}
      >
        {/* Header sidebar */}
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={() => setOpen(false)}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
              <circle cx="16" cy="16" r="15" fill="#C73E1D" />
              <text
                x="50%"
                y="55%"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="var(--font-fraunces), Georgia, serif"
                fontSize="18"
                fontWeight="700"
                fill="#F9F1E4"
              >
                R
              </text>
            </svg>
            <span className="font-display text-xl font-bold">Rialto</span>
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink hover:bg-white"
            aria-label="Fermer"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </header>

        {/* Contenu scrollable */}
        <nav className="flex-1 overflow-y-auto px-3 py-5">
          {/* ─── Bonjour {prénom} (si connecté, Phase 7 FIX 6) ─── */}
          {session && session.first_name && (
            <div className="mb-4 rounded-2xl bg-rialto/5 px-4 py-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-rialto">
                Connecté
              </div>
              <div className="mt-1 font-display text-lg font-bold leading-tight">
                Bonjour {session.first_name} 👋
              </div>
            </div>
          )}

          {/* ─── Navigation ─────────────────────────── */}
          <Section title="Navigation">
            <Item href="/" icon="🏠" label="Accueil" />
            <Item href="/menu" icon="🍕" label="Menu" />
            {cartItems > 0 && (
              <Item
                href="/checkout"
                icon="🛒"
                label="Mon panier"
                badge={cartItems}
              />
            )}
          </Section>

          {/* ─── Rialto Club ────────────────────────── */}
          <Section title="Rialto Club">
            {session ? (
              <>
                <Item
                  href={`/c/${session.short_code}`}
                  icon="🎴"
                  label="Ma carte fidélité"
                />
                <Item href="/rialto-club/roue" icon="🎰" label="Roue de la chance" />
                <Item href="/rialto-club/loterie" icon="🎟️" label="Loterie" />
                <Item
                  href="/mes-commandes"
                  icon="📜"
                  label="Historique des commandes"
                />
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      const confirmed = window.confirm(
                        "Vous allez vous déconnecter de votre compte Rialto Club. Continuer ?",
                      );
                      if (!confirmed) return;
                      clearCustomerSession();
                      setSession(null);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-mute transition hover:bg-white hover:text-rialto"
                  >
                    <span className="text-lg leading-none">🔓</span>
                    <span>Se déconnecter</span>
                  </button>
                </li>
              </>
            ) : (
              <>
                <Item
                  href="/rialto-club/join"
                  icon="🎴"
                  label="Rejoindre Rialto Club"
                  highlight
                />
                <Item
                  href="/rialto-club/connexion"
                  icon="🔑"
                  label="Se connecter"
                />
                {/* Page fidélité re-routée (04.08.2026) : retrouve la
                    carte par téléphone — l'entrée des non-connectés. Les
                    connectés gardent le lien direct /c/{code} ci-dessus. */}
                <Item
                  href="/rialto-club/fidelite"
                  icon="🎁"
                  label="Ma carte fidélité"
                />
              </>
            )}
          </Section>

          {/* ─── Infos ──────────────────────────────── */}
          <Section title="Infos">
            <Item
              href="/#location"
              icon="📍"
              label="Nous trouver"
            />
            <ExternalItem
              href="https://search.google.com/local/writereview?placeid=ChIJrbzJL6cvjEcRHK7RrA9M3ic"
              icon="⭐"
              label="Laisser un avis"
            />
            <ExternalItem
              href={`tel:${RIALTO_INFO.phoneTel}`}
              icon="📞"
              label={`Appeler ${RIALTO_INFO.phoneDisplay}`}
            />
          </Section>

          {/* ─── Langue (refonte 20.08 : le sélecteur vit ICI) ───────
              i18n = lot 3 : la langue courante est la seule active, les
              autres sont listées « bientôt » et INACTIVES — aucune
              promesse non tenue. */}
          <Section title="Langue">
            <li>
              <button
                type="button"
                onClick={() => setLanguesOuvertes((o) => !o)}
                className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-ink transition hover:bg-neutral-50"
                aria-expanded={languesOuvertes}
              >
                <span className="text-lg leading-none">
                  {LOCALE_META[locale].flag}
                </span>
                <span className="flex-1 text-left">
                  {LOCALE_META[locale].label}
                </span>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  className={`text-mute transition-transform ${languesOuvertes ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {languesOuvertes && (
                <ul className="mt-1 space-y-0.5 pl-2">
                  {LOCALES.map((l: Locale) =>
                    l === locale ? (
                      <li
                        key={l}
                        className="flex items-center gap-3 rounded-xl bg-rialto/5 px-2.5 py-2 text-sm font-semibold text-rialto"
                      >
                        <span className="text-base leading-none">
                          {LOCALE_META[l].flag}
                        </span>
                        <span className="flex-1">{LOCALE_META[l].label}</span>
                        <span aria-hidden>✓</span>
                      </li>
                    ) : (
                      <li
                        key={l}
                        className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm text-mute"
                        aria-disabled
                      >
                        <span className="text-base leading-none opacity-50">
                          {LOCALE_META[l].flag}
                        </span>
                        <span className="flex-1">{LOCALE_META[l].label}</span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                          bientôt
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </li>
          </Section>

          {/* ─── Légal (petit gris en bas) ──────────── */}
          <div className="mt-6 border-t border-border pt-4">
            <div className="space-y-1 px-2 text-[11px] text-mute">
              <Link
                href="/mentions-legales"
                className="block py-1 hover:text-ink"
              >
                Mentions légales
              </Link>
              <Link href="/cgv" className="block py-1 hover:text-ink">
                Conditions générales
              </Link>
              <Link href="/privacy" className="block py-1 hover:text-ink">
                Politique de confidentialité
              </Link>
              {/* onDone referme le menu : le bandeau rouvert (z-60) serait
                  sinon invisible derrière l'overlay (z-90). */}
              <ManageCookiesButton
                className="block cursor-pointer py-1 text-left hover:text-ink"
                onDone={() => setOpen(false)}
              />
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
}

/* ─── Sous-composants ──────────────────────────────── */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-rialto">
        {title}
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

function Item({
  href,
  icon,
  label,
  badge,
  highlight,
}: {
  href: string;
  icon: string;
  label: string;
  badge?: number;
  highlight?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium transition ${
          highlight
            ? "bg-rialto text-white shadow-card hover:bg-rialto-dark"
            : "text-ink hover:bg-white"
        }`}
      >
        <span className="text-lg leading-none">{icon}</span>
        <span className="flex-1">{label}</span>
        {badge !== undefined && (
          <span
            className={`tabular inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
              highlight ? "bg-white/20 text-white" : "bg-rialto text-white"
            }`}
          >
            {badge}
          </span>
        )}
      </Link>
    </li>
  );
}

function ExternalItem({
  href,
  icon,
  label,
}: {
  href: string;
  icon: string;
  label: string;
}) {
  return (
    <li>
      <a
        href={href}
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
        className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-medium text-ink transition hover:bg-white"
      >
        <span className="text-lg leading-none">{icon}</span>
        <span className="flex-1">{label}</span>
        {href.startsWith("http") && (
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="text-mute"
          >
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        )}
      </a>
    </li>
  );
}
