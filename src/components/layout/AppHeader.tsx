"use client";

/**
 * AppHeader — l'en-tête GLOBAL du site client (refonte UI lot 1, ordre
 * Uber Eats, GO Augustin 20.08.2026) :
 *   burger · logo cliquable · « adresse + moment » · recherche · caddie
 *   badgé · compte.
 *
 * POLITIQUE PAR ROUTE (validée 20.08) :
 *   - /checkout, /dashboard/*, /scan : return null — le checkout rend son
 *     header minimal local (zéro fuite), dashboard et scan ont les leurs.
 *   - /confirmation/* : variante « nav » (burger, logo, caddie, compte)
 *     SANS adresse ni recherche — l'adresse d'une commande partie n'est
 *     plus modifiable, l'afficher inviterait à la confusion.
 *   - tout le reste : variante complète. Hors du menu, la recherche
 *     redirige vers /menu?q=… ; sur /menu elle filtre en direct via
 *     l'événement `rialto:menu-search` (aucun appel réseau).
 *
 * L'ADRESSE VIT ICI (plus dans le panier) : le bouton « adresse ·
 * moment » ouvre le panneau « Détails de la livraison » (adresse
 * actuelle, Modifier, Livrer maintenant, Planifier). « Planifier » ne
 * PROMET rien : il renvoie au choix du moment au checkout (le sélecteur
 * y vit — commande normale documentée tant que la planification réelle
 * n'existe pas, cf. GO_LIVE.md point bloquant).
 *
 * Tout ce qui dépend du localStorage (adresse, panier, session) n'est
 * rendu qu'après montage (`monte`) — jamais de mismatch d'hydratation.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import RialtoLogo from "@/components/brand/RialtoLogo";
import HamburgerMenu from "@/components/layout/HamburgerMenu";
import {
  cartCount,
  readAddress,
  readCart,
  type QualifiedAddress,
} from "@/lib/clientStore";
import {
  readCustomerSession,
  type CustomerSession,
} from "@/lib/customerSession";

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();

  const [monte, setMonte] = useState(false);
  const [adresse, setAdresse] = useState<QualifiedAddress | null>(null);
  const [nbArticles, setNbArticles] = useState(0);
  const [session, setSession] = useState<CustomerSession | null>(null);
  const [panneauLivraison, setPanneauLivraison] = useState(false);
  const [q, setQ] = useState("");
  const [rechercheMobile, setRechercheMobile] = useState(false);
  const panneauRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMonte(true);
    // Arrivée directe sur /menu?q=… : le champ reflète le filtre actif.
    if (window.location.pathname === "/menu") {
      const q0 = new URLSearchParams(window.location.search).get("q");
      if (q0) setQ(q0);
    }
    // « Effacer la recherche » depuis l'état vide du menu.
    const onClear = () => setQ("");
    window.addEventListener("rialto:menu-search-clear", onClear);
    const syncAddr = () => setAdresse(readAddress());
    const syncCart = () => setNbArticles(cartCount(readCart()));
    const syncSession = () => setSession(readCustomerSession());
    syncAddr();
    syncCart();
    syncSession();
    window.addEventListener("rialto:address-updated", syncAddr);
    window.addEventListener("rialto:cart-updated", syncCart);
    window.addEventListener("rialto:session-updated", syncSession);
    return () => {
      window.removeEventListener("rialto:menu-search-clear", onClear);
      window.removeEventListener("rialto:address-updated", syncAddr);
      window.removeEventListener("rialto:cart-updated", syncCart);
      window.removeEventListener("rialto:session-updated", syncSession);
    };
  }, []);

  // Ferme le panneau livraison à la navigation et au clic extérieur.
  // SYNCHRONISATION RECHERCHE (relecture 20.08) : à chaque navigation, le
  // champ s'aligne sur la vérité de l'URL — ?q= sur /menu, vide ailleurs.
  // Sans ça, un q périmé restait affiché avec un menu non filtré (l'event
  // de re-dispatch partait avant que MenuClient n'écoute).
  useEffect(() => {
    setPanneauLivraison(false);
    setRechercheMobile(false);
    if (pathname === "/menu") {
      setQ(new URLSearchParams(window.location.search).get("q") ?? "");
    } else {
      setQ("");
    }
  }, [pathname]);
  useEffect(() => {
    if (!panneauLivraison) return;
    const handler = (e: MouseEvent) => {
      if (panneauRef.current && !panneauRef.current.contains(e.target as Node)) {
        setPanneauLivraison(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanneauLivraison(false);
    };
    document.addEventListener("click", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [panneauLivraison]);

  const surMenu = pathname === "/menu";

  // La recherche filtre EN DIRECT sur /menu (événement, zéro réseau).
  useEffect(() => {
    if (!surMenu) return;
    window.dispatchEvent(
      new CustomEvent("rialto:menu-search", { detail: q }),
    );
  }, [q, surMenu]);

  // Routes sans header global.
  if (
    pathname.startsWith("/checkout") ||
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/scan")
  ) {
    return null;
  }
  const varianteNav = pathname.startsWith("/confirmation");

  const soumetRecherche = (e: React.FormEvent) => {
    e.preventDefault();
    if (!surMenu) {
      router.push(q.trim() ? `/menu?q=${encodeURIComponent(q.trim())}` : "/menu");
    }
  };

  const clicCaddie = () => {
    if (surMenu) {
      window.dispatchEvent(new CustomEvent("rialto:cart-toggle"));
    } else {
      router.push("/menu?panier=1");
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white">
      <div className="container-hero flex h-14 items-center gap-2 sm:gap-3 md:gap-4">
        {/* Burger (le panneau vit dans HamburgerMenu, glisse de gauche) */}
        <HamburgerMenu inline />

        {/* Logo cliquable — un client QUALIFIÉ va au menu (la home le
            re-redirigerait aussitôt via RetourClient : un logo qui flashe
            est un logo cassé — relecture 20.08) ; sans adresse → accueil. */}
        <Link
          href={monte && adresse ? "/menu" : "/"}
          className="shrink-0"
          aria-label="Rialto"
        >
          <RialtoLogo size="sm" asStatic />
        </Link>

        {/* Bloc « adresse · moment » — UN bouton, panneau détails */}
        {!varianteNav && monte && adresse && (
          <div className="relative min-w-0" ref={panneauRef}>
            <button
              type="button"
              onClick={() => setPanneauLivraison((o) => !o)}
              className="hidden min-w-0 items-center gap-2 rounded-btn px-3 py-2 text-sm font-medium text-ink transition hover:bg-neutral-100 md:flex"
              aria-expanded={panneauLivraison}
              aria-haspopup="dialog"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#C73E1D" className="shrink-0" aria-hidden>
                <path d="M12 2C7.58 2 4 5.58 4 10c0 7 8 12 8 12s8-5 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
              </svg>
              <span className="max-w-[180px] truncate lg:max-w-[240px]">
                {adresse.address}
              </span>
              <span className="hidden shrink-0 text-mute lg:inline">· Maintenant</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0 text-mute" aria-hidden>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {panneauLivraison && (
              <div
                role="dialog"
                aria-label="Détails de la livraison"
                // Mobile : FIXE sous la barre, pleine largeur moins les
                // marges — l'ancrage absolute au bouton desktop (hidden en
                // <md) plaçait le panneau à moitié hors écran, « Modifier »
                // intouchable (relecture 20.08). Desktop : popover ancré.
                className="fixed inset-x-3 top-16 z-50 rounded-2xl border border-border bg-white p-4 shadow-pop md:absolute md:inset-x-auto md:left-0 md:top-full md:mt-2 md:w-80"
              >
                <div className="text-sm font-semibold text-ink">
                  Détails de la livraison
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 text-sm text-ink">
                    <div className="truncate font-medium">{adresse.address}</div>
                    <div className="text-mute">
                      {adresse.postal_code} {adresse.city ?? ""}
                    </div>
                  </div>
                  <Link
                    href="/?need_address=1"
                    className="shrink-0 rounded-btn border border-border px-3 py-1.5 text-xs font-semibold text-ink transition hover:border-ink"
                  >
                    Modifier
                  </Link>
                </div>
                <div className="my-3 border-t border-border" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 rounded-btn bg-neutral-100 px-3 py-2 text-sm font-medium text-ink">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                    Livrer maintenant
                  </div>
                  {/* « Planifier » ne promet RIEN ici : le choix du moment
                      se fait au checkout (sélecteur É7). */}
                  {nbArticles > 0 ? (
                    <Link
                      href="/checkout"
                      className="flex items-center gap-2 rounded-btn px-3 py-2 text-sm text-ink transition hover:bg-neutral-100"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0" aria-hidden>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Planifier — au moment de payer
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 rounded-btn px-3 py-2 text-sm text-mute">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0" aria-hidden>
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Planifier — disponible au moment de payer
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Recherche (desktop) — filtre le menu chargé, zéro réseau */}
        {!varianteNav && (
          <form
            onSubmit={soumetRecherche}
            className="hidden min-w-0 flex-1 justify-center md:flex"
            role="search"
          >
            <div className="flex w-full max-w-md items-center gap-2 rounded-btn bg-neutral-100 px-3.5 py-2">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-mute" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.5" y2="16.5" />
              </svg>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher dans le menu Rialto"
                className="w-full bg-transparent text-sm text-ink placeholder-mute outline-none"
                aria-label="Rechercher dans le menu"
              />
            </div>
          </form>
        )}
        {varianteNav && <div className="flex-1" />}

        {/* Loupe mobile (déplie un champ sous la barre) */}
        {!varianteNav && (
          <button
            type="button"
            onClick={() => setRechercheMobile((o) => !o)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-btn text-ink transition hover:bg-neutral-100 md:hidden"
            aria-label="Rechercher"
            aria-expanded={rechercheMobile}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </button>
        )}

        {/* Caddie badgé */}
        <button
          type="button"
          onClick={clicCaddie}
          className="relative ml-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-btn text-ink transition hover:bg-neutral-100 md:ml-0"
          aria-label={`Panier${monte && nbArticles > 0 ? ` (${nbArticles})` : ""}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="9" cy="21" r="1.6" />
            <circle cx="19" cy="21" r="1.6" />
            <path d="M2.5 3h2l2.6 12.5a2 2 0 0 0 2 1.5h9.2a2 2 0 0 0 2-1.6L22 7H6" />
          </svg>
          {monte && nbArticles > 0 && (
            <span className="tabular absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rialto px-1 text-[11px] font-bold text-white">
              {nbArticles}
            </span>
          )}
        </button>

        {/* Compte */}
        {monte &&
          (session ? (
            <Link
              href={`/c/${session.short_code}`}
              className="hidden h-10 shrink-0 items-center gap-2 rounded-btn px-2.5 text-sm font-medium text-ink transition hover:bg-neutral-100 sm:inline-flex"
              title={`Rialto Club — ${session.first_name ?? ""}`}
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-rialto text-xs font-bold text-white">
                {(session.first_name ?? "R").charAt(0).toUpperCase()}
              </span>
            </Link>
          ) : (
            <Link
              href="/rialto-club/connexion"
              className="hidden h-10 shrink-0 items-center rounded-btn border border-border px-3.5 text-sm font-semibold text-ink transition hover:border-ink sm:inline-flex"
            >
              Connexion
            </Link>
          ))}
      </div>

      {/* Ligne 2 mobile : adresse compacte + recherche dépliée */}
      {!varianteNav && monte && (adresse || rechercheMobile) && (
        <div className="container-hero space-y-2 pb-2 md:hidden">
          {adresse && (
            <button
              type="button"
              onClick={() => setPanneauLivraison((o) => !o)}
              aria-expanded={panneauLivraison}
              aria-haspopup="dialog"
              className="flex w-full items-center gap-2 rounded-btn bg-neutral-100 px-3 py-2 text-left text-xs font-medium text-ink"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#C73E1D" className="shrink-0" aria-hidden>
                <path d="M12 2C7.58 2 4 5.58 4 10c0 7 8 12 8 12s8-5 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
              </svg>
              <span className="truncate">
                {adresse.address}, {adresse.postal_code} · Maintenant
              </span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="ml-auto shrink-0 text-mute" aria-hidden>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          )}
          {rechercheMobile && (
            <form onSubmit={soumetRecherche} role="search">
              <div className="flex items-center gap-2 rounded-btn bg-neutral-100 px-3.5 py-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="shrink-0 text-mute" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.5" y2="16.5" />
                </svg>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Rechercher dans le menu"
                  autoFocus
                  className="w-full bg-transparent text-sm text-ink placeholder-mute outline-none"
                  aria-label="Rechercher dans le menu"
                />
              </div>
            </form>
          )}
        </div>
      )}
    </header>
  );
}
