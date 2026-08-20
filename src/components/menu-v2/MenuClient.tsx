"use client";

/**
 * Page /menu — client component.
 *
 * - Header sticky : logo + adresse + compteur panier
 * - Nav catégories horizontale scrollable + scroll-spy
 * - Grid des plats groupés par catégorie
 * - Modale plat pour customisation
 * - Footer sticky "Voir mon panier (X plats · Y CHF)" → /checkout
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type {
  MenuCategory,
  MenuItem,
  MenuItemOption,
  CartItem,
  CartOptionSelection,
} from "@/lib/types";
import DishModal from "./DishModal";
import MenuItemCard from "./MenuItemCard";
import CartPanel from "./CartPanel";
import SidebarMenu from "@/components/layout/SidebarMenu";
import { formatCHF } from "@/lib/format";
import {
  addLinesToCart,
  cartCount,
  cartLineKey,
  cartSubtotal,
  readAddress,
  readCart,
  type QualifiedAddress,
} from "@/lib/clientStore";
import { RIALTO_INFO } from "@/lib/rialto-data";
import { track } from "@/lib/tracking";
import { useEtaRange } from "@/lib/eta/useEtaRange";
import { comptePizzasPanier } from "@/lib/eta/pizzas";

type Props = {
  categories: MenuCategory[];
  items: MenuItem[];
  options: MenuItemOption[];
};

import FilterModal, {
  itemMatchesFilters,
  readStoredFilters,
  writeStoredFilters,
  readStoredExcludedAllergens,
  writeStoredExcludedAllergens,
  type FilterKey,
} from "./FilterModal";

export default function MenuClient({ categories, items, options }: Props) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<QualifiedAddress | null>(null);
  // Fourchette ETA vivante (même moteur que checkout + suivi), alimentée
  // par le compte de pizzas du panier — le figé de zone n'est qu'un repli
  // réseau (refonte par ressource, 18.08.2026).
  const etaLive = useEtaRange(address?.postal_code, comptePizzasPanier(cart));
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    new Set(),
  );
  const [excludedAllergens, setExcludedAllergens] = useState<Set<string>>(
    new Set(),
  );
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  // Recherche dans le menu (É3 refonte 20.08) : alimentée par l'AppHeader
  // (event `rialto:menu-search` à chaque frappe) et par ?q= à l'arrivée
  // depuis une autre page. Filtre PUR sur les articles déjà chargés
  // (nom + description) — aucun appel réseau.
  const [recherche, setRecherche] = useState("");
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const categoryNavRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setRecherche(q);
    const onSearch = (e: Event) =>
      setRecherche(String((e as CustomEvent).detail ?? ""));
    window.addEventListener("rialto:menu-search", onSearch);
    return () => window.removeEventListener("rialto:menu-search", onSearch);
  }, []);

  // Restore filters + exclusions depuis localStorage au mount
  useEffect(() => {
    setActiveFilters(readStoredFilters());
    setExcludedAllergens(readStoredExcludedAllergens());
  }, []);

  // Persiste à chaque changement
  useEffect(() => {
    writeStoredFilters(activeFilters);
  }, [activeFilters]);
  useEffect(() => {
    writeStoredExcludedAllergens(excludedAllergens);
  }, [excludedAllergens]);

  useEffect(() => {
    // Hydrate from localStorage
    setCart(readCart());
    setAddress(readAddress());

    // Si pas d'adresse qualifiée → renvoie vers home
    const a = readAddress();
    if (!a) {
      router.replace("/?need_address=1");
    }

    const onCartUpdate = () => setCart(readCart());
    const onAddrUpdate = () => setAddress(readAddress());
    window.addEventListener("rialto:cart-updated", onCartUpdate);
    window.addEventListener("rialto:address-updated", onAddrUpdate);
    return () => {
      window.removeEventListener("rialto:cart-updated", onCartUpdate);
      window.removeEventListener("rialto:address-updated", onAddrUpdate);
    };
  }, [router]);

  // Scroll-spy : détecte la catégorie visible
  useEffect(() => {
    if (!categories.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) {
          setActiveCategory(visible[0].target.id);
        }
      },
      { rootMargin: "-120px 0px -70% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    for (const c of categories) {
      const el = sectionRefs.current[c.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [categories]);

  // Scroll auto du nav catégories pour garder l'active visible
  useEffect(() => {
    if (!activeCategory) return;
    const nav = categoryNavRef.current;
    if (!nav) return;
    const activeEl = nav.querySelector<HTMLElement>(
      `[data-cat="${activeCategory}"]`,
    );
    if (activeEl) {
      activeEl.scrollIntoView({
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      });
    }
  }, [activeCategory]);

  // Pré-calcule un map category_id → name pour la logique de filtre
  // (certains filtres comme "Pizzas"/"Pâtes" matchent sur le nom de catégorie)
  const categoryById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of categories) map[c.id] = c.name;
    return map;
  }, [categories]);

  // Insensible casse ET accents (« margherita » trouve « Margheritä »).
  const normalise = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");

  const itemsByCategory = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const terme = normalise(recherche.trim());
    for (const it of items) {
      if (
        terme &&
        !normalise(it.name ?? "").includes(terme) &&
        !normalise(it.description ?? "").includes(terme)
      )
        continue;
      // Phase 11 C13 : filtre saisonnier hors de la fenêtre de saison
      if (it.is_seasonal) {
        const start = it.season_start ? String(it.season_start).slice(0, 10) : null;
        const end = it.season_end ? String(it.season_end).slice(0, 10) : null;
        if (start && todayKey < start) continue;
        if (end && todayKey > end) continue;
      }
      const catName = categoryById[it.category_id];
      if (!itemMatchesFilters(it, activeFilters, catName, excludedAllergens))
        continue;
      (map[it.category_id] ??= []).push(it);
    }
    // Phase 11 C13 : tri is_priority first, puis display_order ASC
    for (const catId of Object.keys(map)) {
      map[catId].sort((a, b) => {
        const pa = a.is_priority ? 0 : 1;
        const pb = b.is_priority ? 0 : 1;
        if (pa !== pb) return pa - pb;
        return (a.display_order ?? 999) - (b.display_order ?? 999);
      });
    }
    return map;
  }, [items, activeFilters, excludedAllergens, categoryById, recherche]);

  // Compteur live pour le bouton "Appliquer (X résultats)" de la modale
  const countResults = (
    filters: Set<FilterKey>,
    excluded: Set<string>,
  ): number => {
    let n = 0;
    for (const it of items) {
      const catName = categoryById[it.category_id];
      if (itemMatchesFilters(it, filters, catName, excluded)) n++;
    }
    return n;
  };

  // FIX 4 phase 6 : clés de filtres avec ≥ 1 item correspondant.
  // Utilisé pour cacher les filtres "0 résultats" dans la modale.
  const availableFilterKeys = useMemo(() => {
    const keys = new Set<FilterKey>();
    for (const it of items) {
      const catName = categoryById[it.category_id];
      if (it.is_vegetarian) keys.add("vegetarian");
      if (it.is_vegan) keys.add("vegan");
      if (it.is_lactose_free) keys.add("lactose_free");
      if (it.is_gluten_free) keys.add("gluten_free");
      if (it.is_halal) keys.add("halal");
      if (it.is_spicy) keys.add("spicy");
      if (it.is_kids_friendly) keys.add("kids_friendly");
      if (it.tags?.includes("seafood")) keys.add("seafood");
      if (it.tags?.includes("meat")) keys.add("meat");
      if (it.tags?.includes("anatolian")) keys.add("anatolian");
      const cn = (catName ?? "").toLowerCase();
      const name = (it.name ?? "").toLowerCase();
      if (cn.includes("pizza") || name.includes("pizza")) keys.add("pizza");
      if (
        cn.includes("pâte") ||
        cn.includes("pasta") ||
        /tagliatelle|spaghetti|linguine|tortellini|lasagne/.test(name)
      )
        keys.add("pasta");
    }
    return keys;
  }, [items, categoryById]);

  // FIX 5 phase 6 : allergènes présents dans au moins 1 plat.
  // Source pour la section "Je ne veux PAS" dans la modale.
  const availableAllergens = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) {
      const al = (it as MenuItem & { allergens?: string[] | null }).allergens;
      if (Array.isArray(al)) {
        for (const a of al) if (a) set.add(a);
      }
    }
    return set;
  }, [items]);

  const subtotal = cartSubtotal(cart);
  const count = cartCount(cart);
  const minAmount = address?.min_order_amount ?? RIALTO_INFO.minOrderCHF;
  const missing = Math.max(0, minAmount - subtotal);
  const canCheckout = count > 0 && missing === 0;

  function handleSelectItem(item: MenuItem) {
    if (item.has_options) {
      setSelectedItem(item);
      return;
    }
    // Pas d'options : ajout direct
    addToCart(item, [], 1, "");
  }

  // Lot D : view_item à l'OUVERTURE effective de la modale produit
  // (décision actée). Les items SANS options s'ajoutent en direct sans
  // jamais ouvrir de modale → pas de view_item pour eux, trou assumé et
  // documenté dans le rapport du lot.
  useEffect(() => {
    if (!selectedItem) return;
    track.viewItem({
      id: selectedItem.id,
      name: selectedItem.name,
      price: Number(selectedItem.price),
      category: categoryById[selectedItem.category_id],
    });
  }, [selectedItem, categoryById]);

  function addToCart(
    item: MenuItem,
    sel: CartOptionSelection[],
    quantity: number,
    notes: string,
  ) {
    const key = cartLineKey(item.id, sel, notes);
    const unitPrice =
      Number(item.price) + sel.reduce((s, o) => s + o.extra_price, 0);
    const next = addLinesToCart([
      {
        key,
        menu_item_id: item.id,
        name: item.name,
        base_price: Number(item.price),
        quantity,
        options: sel,
        notes,
        unit_price: unitPrice,
        subtotal: unitPrice * quantity,
        category: categoryById[item.category_id] ?? null,
      },
    ]);
    setCart(next);
    setSelectedItem(null);
  }

  const itemOptions = useMemo(
    () =>
      selectedItem
        ? options.filter((o) => o.item_id === selectedItem.id)
        : [],
    [selectedItem, options],
  );

  const selectedCategory = categories.find(
    (c) => c.id === selectedItem?.category_id,
  );

  return (
    <main className="min-h-screen bg-white">
      {/* ─── L'adresse et le caddie vivent dans l'AppHeader global depuis
          la refonte 20.08 — ce composant ne garde que la nav catégories
          mobile (les chips, lg:hidden ; retravaillées au lot 2 mobile). */}
      <header className="border-b border-border bg-white">
        {/* Nav catégories chips (mobile/tablet uniquement — la colonne
            catégories la remplace en lg+) + bouton Filtrer */}
        <div className="container-hero flex items-center gap-2 pb-2 pt-2 lg:hidden">
          <div
            ref={categoryNavRef}
            className="scrollbar-none flex flex-1 gap-2 overflow-x-auto"
          >
            {categories.map((c) => (
              <button
                key={c.id}
                data-cat={c.id}
                type="button"
                onClick={() => {
                  const el = sectionRefs.current[c.id];
                  if (el) {
                    const y = el.getBoundingClientRect().top + window.scrollY - 130;
                    window.scrollTo({ top: y, behavior: "smooth" });
                  }
                }}
                className={`chip ${activeCategory === c.id ? "chip-active" : ""}`}
              >
                {c.icon && <span>{c.icon}</span>}
                {c.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFilterModalOpen(true)}
            className={`relative shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              activeFilters.size + excludedAllergens.size > 0
                ? "border-rialto bg-rialto text-white"
                : "border-border bg-white text-ink hover:border-ink"
            }`}
            aria-label="Filtrer le menu"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Filtrer
            {activeFilters.size + excludedAllergens.size > 0 && (
              <span className="tabular inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-rialto">
                {activeFilters.size + excludedAllergens.size}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Phase 13 polish iPad — layout 3 colonnes : Sidebar tab | Content | CartPanel */}
      <div className="flex">
        {/* Sidebar tab catégories — sticky, rétractable, iPad-first */}
        <SidebarMenu
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            icon: c.icon,
            count: itemsByCategory[c.id]?.length ?? 0,
          }))}
          activeId={activeCategory ?? undefined}
          onSelect={(id) => {
            setActiveCategory(id);
            const el = sectionRefs.current[id];
            if (el) {
              const y = el.getBoundingClientRect().top + window.scrollY - 130;
              window.scrollTo({ top: y, behavior: "smooth" });
            }
          }}
        />

        {/* Content principal */}
        <div className="min-w-0 flex-1 px-3 sm:px-4 md:px-5 pt-4 md:pt-5 lg:flex lg:gap-5">
          <div className="min-w-0 flex-1">
      {/* ─── Intro compacte ──────────────────────────────────── */}
      <section className="pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">Menu</span>
          <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold">
            {categories.length > 0 ? categories.length : 11} catégories,{" "}
            <em className="italic text-rialto">
              {items.length > 0 ? items.length : 106} plats.
            </em>
          </h1>
          <p className="mt-1 text-sm text-mute">
            Pizzas Ø33&nbsp;cm, pâtes faites maison, spécialités anatoliennes.
          </p>
          {/* ETA vivante (même moteur que checkout/suivi) — relogée ici
              depuis l'ancien header sticky local (refonte 20.08). */}
          {address && (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-mute">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Livraison {etaLive?.label ?? `~${address.estimated_delivery_minutes ?? 30} min`}
            </p>
          )}
        </div>
        {/* Bouton filtrer visible en lg+ (sidebar a remplacé la nav chips) */}
        <button
          type="button"
          onClick={() => setFilterModalOpen(true)}
          className={`hidden lg:inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
            activeFilters.size + excludedAllergens.size > 0
              ? "border-rialto bg-rialto text-white"
              : "border-border bg-white text-ink hover:border-ink"
          }`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filtrer
          {activeFilters.size + excludedAllergens.size > 0 && (
            <span className="tabular inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-rialto">
              {activeFilters.size + excludedAllergens.size}
            </span>
          )}
        </button>
      </section>

      {/* ─── Sections catégories ───────────────────────────────── */}
      <div className="pb-32 pt-3 lg:pb-6">
        {categories.every((c) => (itemsByCategory[c.id] ?? []).length === 0) ? (
          <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-8 text-center">
            <div className="mb-3 text-4xl">🤔</div>
            <h3 className="font-display text-lg font-bold">
              {recherche.trim()
                ? `Aucun résultat pour « ${recherche.trim()} »`
                : "Aucun plat ne correspond"}
            </h3>
            <p className="mt-1 text-sm text-mute">
              {recherche.trim()
                ? "Vérifiez l'orthographe ou essayez un autre mot."
                : "Essayez de désactiver quelques filtres."}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveFilters(new Set());
                setExcludedAllergens(new Set());
                setRecherche("");
                window.dispatchEvent(
                  new CustomEvent("rialto:menu-search-clear"),
                );
              }}
              className="btn-ghost mt-4"
            >
              {recherche.trim() ? "Effacer la recherche" : "Effacer les filtres"}
            </button>
          </div>
        ) : (
          categories.map((category) => {
            const catItems = itemsByCategory[category.id] ?? [];
            if (catItems.length === 0) return null;
            return (
              <section
                key={category.id}
                id={category.id}
                ref={(el) => {
                  sectionRefs.current[category.id] = el;
                }}
                className="scroll-mt-[140px] pt-5 md:pt-7"
              >
                <h2 className="mb-3 flex items-center gap-2 font-display text-lg sm:text-xl font-bold md:mb-4">
                  {category.icon && (
                    <span className="text-xl">{category.icon}</span>
                  )}
                  {category.name}
                </h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
                  {catItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      categoryName={category.name}
                      onAdd={handleSelectItem}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      {/* ─── Modale plat ───────────────────────────────────────── */}
      {selectedItem && (
        <DishModal
          item={selectedItem}
          options={itemOptions}
          categoryName={selectedCategory?.name}
          onClose={() => setSelectedItem(null)}
          onConfirm={(sel, qty, notes) =>
            addToCart(selectedItem, sel, qty, notes)
          }
        />
      )}

      {/* ─── Modale filtres ────────────────────────────────────── */}
      <FilterModal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        initialFilters={activeFilters}
        initialExcludedAllergens={excludedAllergens}
        availableFilterKeys={availableFilterKeys}
        availableAllergens={availableAllergens}
        onApply={(f, ex) => {
          setActiveFilters(f);
          setExcludedAllergens(ex);
        }}
        countResults={countResults}
      />

          </div>
          {/* Phase 11 C4 : desktop sidebar panier (sticky) + mobile drawer */}
          <CartPanel
            cart={cart}
            setCart={setCart}
            minOrderAmount={minAmount}
            fulfillmentType={address ? "delivery" : "pickup"}
            zone={
              address
                ? {
                    min_order_amount: Number(address.min_order_amount ?? 0),
                    delivery_fee: Number(address.delivery_fee ?? 0),
                  }
                : null
            }
          />
        </div>
      </div>

      {/* Mention légale allergènes (denrées alimentaires CH, audit 19.08) —
          complète le filtre par allergène : l'info de référence reste le
          restaurant. */}
      {/* pb-28 mobile : la barre panier fixe (CartPanel, ~70 px) recouvrait
          la mention en bas de page dès qu'un article était au panier —
          précisément le parcours de commande (relecture 19.08). */}
      <p className="container-hero pb-28 pt-2 text-center text-xs text-mute lg:pb-8">
        Informations sur les allergènes disponibles sur demande —{" "}
        <a href={`tel:${RIALTO_INFO.phoneTel}`} className="underline">
          {RIALTO_INFO.phoneDisplay}
        </a>
        .
      </p>
    </main>
  );
}
