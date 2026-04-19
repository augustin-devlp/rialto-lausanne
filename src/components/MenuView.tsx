"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Restaurant,
  MenuCategory,
  MenuItem,
  MenuItemOption,
  CartItem,
  CartOptionSelection,
} from "@/lib/types";
import { cartItemKey, formatCHF, isOpenNow } from "@/lib/format";
import CategoryNav from "./CategoryNav";
import MenuItemCard from "./MenuItemCard";
import Cart from "./Cart";
import OptionsModal from "./OptionsModal";
import CheckoutForm from "./CheckoutForm";
import Filters, { FilterKind } from "./Filters";

type Props = {
  restaurant: Restaurant;
  categories: MenuCategory[];
  items: MenuItem[];
  options: MenuItemOption[];
};

const STORAGE_KEY = "rialto:cart:v1";

export default function MenuView({
  restaurant,
  categories,
  items,
  options,
}: Props) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [openedItem, setOpenedItem] = useState<MenuItem | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKind>("all");
  const [activeCategory, setActiveCategory] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Load/save cart
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCart(JSON.parse(raw));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // Scroll-spy active category
  useEffect(() => {
    const handler = () => {
      let currentId: string | null = null;
      const threshold = 160;
      for (const cat of categories) {
        const el = sectionRefs.current[cat.id];
        if (el && el.getBoundingClientRect().top <= threshold) {
          currentId = cat.id;
        }
      }
      if (currentId) setActiveCategory(currentId);
    };
    window.addEventListener("scroll", handler, { passive: true });
    handler();
    return () => window.removeEventListener("scroll", handler);
  }, [categories]);

  const optionsByItem = useMemo(() => {
    const map: Record<string, MenuItemOption[]> = {};
    for (const o of options) {
      (map[o.item_id] ??= []).push(o);
    }
    return map;
  }, [options]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) => {
      if (!i.is_available) return false;
      if (filter === "veg" && !i.is_vegetarian) return false;
      if (filter === "spicy" && !i.is_spicy) return false;
      if (q) {
        const hay = `${i.name} ${i.description ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, filter]);

  const itemsByCategory = useMemo(() => {
    const map: Record<string, MenuItem[]> = {};
    for (const i of filteredItems) {
      (map[i.category_id] ??= []).push(i);
    }
    return map;
  }, [filteredItems]);

  const subtotal = cart.reduce((s, c) => s + c.subtotal, 0);
  const openNow = isOpenNow(
    restaurant.order_open_time,
    restaurant.order_close_time,
  );
  const canCheckout =
    restaurant.accepting_orders &&
    openNow &&
    cart.length > 0 &&
    subtotal >= restaurant.order_min_amount;

  const missingMin = Math.max(0, restaurant.order_min_amount - subtotal);

  // Message explicite si le bouton checkout est bloqué, pour ne jamais
  // laisser un user taper "Passer la commande" sans retour visible.
  const blockReason: string | null = !restaurant.accepting_orders
    ? "Rialto ne prend plus de commandes pour le moment."
    : !openNow
      ? `Commandes ouvertes de ${restaurant.order_open_time.slice(0, 5)} à ${restaurant.order_close_time.slice(0, 5)}.`
      : cart.length === 0
        ? "Ajoutez au moins un plat à votre panier."
        : subtotal < restaurant.order_min_amount
          ? `Panier minimum ${formatCHF(restaurant.order_min_amount)} (il manque ${formatCHF(missingMin)}).`
          : null;

  const handleAdd = (item: MenuItem) => {
    if (item.has_options) {
      setOpenedItem(item);
      return;
    }
    addToCart(item, [], "", 1);
  };

  const addToCart = (
    item: MenuItem,
    opts: CartOptionSelection[],
    notes: string,
    qty: number,
  ) => {
    const key = cartItemKey(item.id, opts, notes);
    setCart((prev) => {
      const existing = prev.find((c) => c.key === key);
      if (existing) {
        return prev.map((c) =>
          c.key === key
            ? {
                ...c,
                quantity: c.quantity + qty,
                subtotal: c.unit_price * (c.quantity + qty),
              }
            : c,
        );
      }
      const extras = opts.reduce((s, o) => s + o.extra_price, 0);
      const unit = item.price + extras;
      return [
        ...prev,
        {
          key,
          menu_item_id: item.id,
          name: item.name,
          base_price: item.price,
          quantity: qty,
          options: opts,
          notes,
          unit_price: unit,
          subtotal: unit * qty,
        },
      ];
    });
  };

  const updateQty = (key: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) =>
          c.key === key
            ? {
                ...c,
                quantity: c.quantity + delta,
                subtotal: c.unit_price * (c.quantity + delta),
              }
            : c,
        )
        .filter((c) => c.quantity > 0),
    );
  };

  const clearCart = () => setCart([]);

  const scrollToCategory = (id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      const y = el.getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
  };

  return (
    <div className="bg-white pb-40 lg:pb-0">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rialto font-bold text-white">
              R
            </div>
            <div>
              <div className="text-lg font-bold leading-tight">
                {restaurant.name}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
                <span className="font-semibold text-ink">★ 4.2</span>
                <span>·</span>
                <span>660 avis</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">
                  {openNow ? "Ouvert" : "Fermé"} · Prêt en ~
                  {restaurant.prep_time_minutes} min
                </span>
              </div>
            </div>
          </div>
          <span className="hidden rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink sm:inline">
            Retrait en magasin uniquement
          </span>
        </div>

        <CategoryNav
          categories={categories}
          activeId={activeCategory}
          onSelect={scrollToCategory}
        />
      </header>

      {/* Body */}
      <div id="menu-start" className="mx-auto max-w-6xl px-4 pt-6 lg:grid lg:grid-cols-3 lg:gap-8">
        <main className="lg:col-span-2">
          <Filters
            value={filter}
            onChange={setFilter}
            search={search}
            onSearch={setSearch}
          />

          {!openNow && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Les commandes en ligne sont ouvertes de{" "}
              <strong>{restaurant.order_open_time.slice(0, 5)}</strong> à{" "}
              <strong>{restaurant.order_close_time.slice(0, 5)}</strong>.
            </div>
          )}
          {!restaurant.accepting_orders && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              Le restaurant ne prend pas de commandes pour le moment.
            </div>
          )}

          {categories.map((cat) => {
            const catItems = itemsByCategory[cat.id] ?? [];
            if (!catItems.length) return null;
            return (
              <section
                key={cat.id}
                id={`cat-${cat.id}`}
                ref={(el) => {
                  sectionRefs.current[cat.id] = el;
                }}
                className="mb-10 scroll-mt-36"
              >
                <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold">
                  {cat.icon && <span>{cat.icon}</span>}
                  {cat.name}
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {catItems.map((item) => (
                    <MenuItemCard
                      key={item.id}
                      item={item}
                      onAdd={() => handleAdd(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </main>

        {/* Desktop cart */}
        <aside className="hidden lg:col-span-1 lg:block">
          <div className="sticky top-36">
            <Cart
              items={cart}
              subtotal={subtotal}
              minAmount={restaurant.order_min_amount}
              missingMin={missingMin}
              canCheckout={canCheckout}
              blockReason={blockReason}
              onIncrement={(k) => updateQty(k, +1)}
              onDecrement={(k) => updateQty(k, -1)}
              onCheckout={() => setCheckoutOpen(true)}
            />
          </div>
        </aside>
      </div>

      {/* Mobile cart bar */}
      {cart.length > 0 && (
        <button
          type="button"
          onClick={() => setMobileCartOpen(true)}
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
            WebkitTapHighlightColor: "transparent",
          }}
          className="fixed left-4 right-4 z-30 flex items-center justify-between rounded-full bg-rialto px-5 py-4 text-white shadow-pop lg:hidden active:scale-[0.98]"
        >
          <span className="flex items-center gap-3 text-sm font-semibold">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs">
              {cart.reduce((s, c) => s + c.quantity, 0)}
            </span>
            Voir le panier
          </span>
          <span className="text-sm font-semibold">{formatCHF(subtotal)}</span>
        </button>
      )}

      {mobileCartOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 lg:hidden"
          onClick={() => setMobileCartOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
            }}
            className="absolute bottom-0 left-0 right-0 max-h-[90vh] overflow-auto rounded-t-3xl bg-white p-4"
          >
            <div className="mb-2 flex justify-between">
              <h3 className="text-lg font-bold">Votre commande</h3>
              <button
                className="text-sm text-mute"
                onClick={() => setMobileCartOpen(false)}
              >
                Fermer
              </button>
            </div>
            <Cart
              items={cart}
              subtotal={subtotal}
              minAmount={restaurant.order_min_amount}
              missingMin={missingMin}
              canCheckout={canCheckout}
              blockReason={blockReason}
              onIncrement={(k) => updateQty(k, +1)}
              onDecrement={(k) => updateQty(k, -1)}
              onCheckout={() => {
                setMobileCartOpen(false);
                setCheckoutOpen(true);
              }}
              compact
            />
          </div>
        </div>
      )}

      {openedItem && (
        <OptionsModal
          item={openedItem}
          options={optionsByItem[openedItem.id] ?? []}
          onClose={() => setOpenedItem(null)}
          onConfirm={(opts, qty, notes) => {
            addToCart(openedItem, opts, notes, qty);
            setOpenedItem(null);
          }}
        />
      )}

      {checkoutOpen && (
        <CheckoutForm
          restaurant={restaurant}
          cart={cart}
          subtotal={subtotal}
          onClose={() => setCheckoutOpen(false)}
          onSuccess={() => {
            clearCart();
          }}
        />
      )}
    </div>
  );
}
