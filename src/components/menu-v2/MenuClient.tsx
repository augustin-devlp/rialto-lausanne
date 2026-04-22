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
import { formatCHF } from "@/lib/format";
import {
  cartCount,
  cartLineKey,
  cartSubtotal,
  readAddress,
  readCart,
  writeCart,
  type QualifiedAddress,
} from "@/lib/clientStore";
import { RIALTO_INFO } from "@/lib/rialto-data";

type Props = {
  categories: MenuCategory[];
  items: MenuItem[];
  options: MenuItemOption[];
};

import FilterModal, {
  itemMatchesFilters,
  readStoredFilters,
  writeStoredFilters,
  type FilterKey,
} from "./FilterModal";

export default function MenuClient({ categories, items, options }: Props) {
  const router = useRouter();
  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const [cart, setCart] = useState<CartItem[]>([]);
  const [address, setAddress] = useState<QualifiedAddress | null>(null);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(
    new Set(),
  );
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const categoryNavRef = useRef<HTMLDivElement | null>(null);

  // Restore filters depuis localStorage au mount
  useEffect(() => {
    setActiveFilters(readStoredFilters());
  }, []);

  // Persiste à chaque changement
  useEffect(() => {
    writeStoredFilters(activeFilters);
  }, [activeFilters]);

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

  const itemsByCategory = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    for (const it of items) {
      const catName = categoryById[it.category_id];
      if (!itemMatchesFilters(it, activeFilters, catName)) continue;
      (map[it.category_id] ??= []).push(it);
    }
    return map;
  }, [items, activeFilters, categoryById]);

  // Compteur utilisé dans le bouton "Appliquer (X résultats)" de la modale
  const countResults = (filters: Set<FilterKey>): number => {
    if (filters.size === 0) return items.length;
    let n = 0;
    for (const it of items) {
      const catName = categoryById[it.category_id];
      if (itemMatchesFilters(it, filters, catName)) n++;
    }
    return n;
  };

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

  function addToCart(
    item: MenuItem,
    sel: CartOptionSelection[],
    quantity: number,
    notes: string,
  ) {
    const key = cartLineKey(item.id, sel, notes);
    const unitPrice =
      Number(item.price) + sel.reduce((s, o) => s + o.extra_price, 0);
    const existing = cart.find((c) => c.key === key);
    let next: CartItem[];
    if (existing) {
      next = cart.map((c) =>
        c.key === key
          ? {
              ...c,
              quantity: c.quantity + quantity,
              subtotal: unitPrice * (c.quantity + quantity),
            }
          : c,
      );
    } else {
      next = [
        ...cart,
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
        },
      ];
    }
    setCart(next);
    writeCart(next);
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
    <main className="min-h-screen bg-cream">
      {/* ─── Header sticky ─────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-cream/95 backdrop-blur-lg">
        <div className="container-hero flex h-14 items-center gap-3 sm:h-16">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-ink"
            aria-label="Accueil Rialto"
          >
            <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
              <circle cx="16" cy="16" r="15" fill="#C73E1D" />
              <text
                x="50%"
                y="54%"
                textAnchor="middle"
                dominantBaseline="middle"
                fontFamily="var(--font-fraunces), Georgia, serif"
                fontSize="17"
                fontWeight="700"
                fill="#F9F1E4"
              >
                R
              </text>
            </svg>
            <span className="hidden font-display text-xl font-bold sm:inline">
              Rialto
            </span>
          </Link>

          {address && (
            <Link
              href="/"
              className="group flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs text-ink transition hover:shadow-card sm:text-sm"
              title="Changer d'adresse"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="#C73E1D"
                className="shrink-0"
              >
                <path d="M12 2C7.58 2 4 5.58 4 10c0 7 8 12 8 12s8-5 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
              </svg>
              <span className="truncate">
                {address.address}, {address.postal_code}
              </span>
              <span className="ml-auto shrink-0 text-mute group-hover:text-ink">
                ✎
              </span>
            </Link>
          )}

          <div className="hidden items-center gap-2 text-xs text-mute md:flex">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            ~{address?.estimated_delivery_minutes ?? 30}&nbsp;min
          </div>
        </div>

        {/* Nav catégories + bouton Filtrer à droite (sticky fin) */}
        <div className="container-hero flex items-center gap-2 pb-3 pt-1">
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
              activeFilters.size > 0
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
            {activeFilters.size > 0 && (
              <span className="tabular inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-rialto">
                {activeFilters.size}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ─── Intro ─────────────────────────────────────────────── */}
      <section className="container-hero pt-8 md:pt-12">
        <span className="eyebrow">Menu</span>
        <h1 className="mt-3 font-display text-h1 font-bold">
          {categories.length > 0 ? categories.length : 11} catégories,{" "}
          <em className="italic text-rialto">
            {items.length > 0 ? items.length : 106} plats.
          </em>
        </h1>
        <p className="mt-2 text-sm text-mute md:text-base">
          Pizzas Ø33&nbsp;cm, pâtes faites maison, spécialités anatoliennes.
        </p>
      </section>

      {/* ─── Sections catégories ───────────────────────────────── */}
      <div className="container-hero pb-40 pt-8">
        {categories.every((c) => (itemsByCategory[c.id] ?? []).length === 0) ? (
          <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-8 text-center">
            <div className="mb-3 text-4xl">🤔</div>
            <h3 className="font-display text-lg font-bold">
              Aucun plat ne correspond
            </h3>
            <p className="mt-1 text-sm text-mute">
              Essayez de désactiver quelques filtres.
            </p>
            <button
              type="button"
              onClick={() => setActiveFilters(new Set())}
              className="btn-ghost mt-4"
            >
              Effacer les filtres
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
                className="scroll-mt-[150px] pt-10 md:pt-14"
              >
                <h2 className="mb-5 flex items-center gap-3 font-display text-h2 font-bold md:mb-7">
                  {category.icon && (
                    <span className="text-2xl">{category.icon}</span>
                  )}
                  {category.name}
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
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
        onApply={setActiveFilters}
        countResults={countResults}
      />

      {/* ─── Bandeau sticky bas ────────────────────────────────── */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur-lg animate-fade-up">
          <div className="container-hero py-3">
            {missing > 0 ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm">
                  <span className="font-display font-semibold text-ink">
                    {formatCHF(missing)}
                  </span>{" "}
                  <span className="text-mute">de plus pour la livraison</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-cream-dark sm:flex-1 sm:max-w-xs">
                  <div
                    className="h-full rounded-full bg-rialto transition-all"
                    style={{ width: `${Math.min(100, (subtotal / minAmount) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <Link
                href="/checkout"
                className="btn-primary-lg group flex w-full items-center justify-between"
              >
                <span>Voir mon panier</span>
                <span className="tabular flex items-center gap-2 text-white/90">
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-sm">
                    {count}
                  </span>
                  <span className="font-semibold">{formatCHF(subtotal)}</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    className="transition-transform group-hover:translate-x-0.5"
                  >
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
