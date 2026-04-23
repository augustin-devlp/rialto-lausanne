"use client";

/**
 * Page produit détaillée — photo hero, description longue, tags régime,
 * liste ingrédients, allergènes, options, CTA sticky "Ajouter au panier".
 */

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type {
  MenuItem,
  MenuItemOption,
  CartOptionSelection,
} from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { matchDishImage } from "@/lib/rialto-data";
import { cartLineKey, readAddress, readCart, writeCart } from "@/lib/clientStore";

type EnrichedItem = MenuItem & {
  is_gluten_free?: boolean | null;
  is_vegan?: boolean | null;
  is_lactose_free?: boolean | null;
  is_halal?: boolean | null;
  is_kids_friendly?: boolean | null;
  ingredients?: string[] | null;
  allergens?: string[] | null;
  description_long?: string | null;
  tags?: string[] | null;
  category_name?: string | null;
};

/* Libellés des allergènes UE (codes backend → français affiché) */
const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Gluten",
  crustaceans: "Crustacés",
  eggs: "Œufs",
  fish: "Poisson",
  peanuts: "Arachides",
  soybeans: "Soja",
  milk: "Lait",
  nuts: "Fruits à coque",
  celery: "Céleri",
  mustard: "Moutarde",
  sesame: "Sésame",
  sulphites: "Sulfites",
  lupin: "Lupin",
  molluscs: "Mollusques",
};

type DietTag = { icon: string; label: string; bg: string; fg: string };

function dietTags(item: EnrichedItem): DietTag[] {
  const tags: DietTag[] = [];
  if (item.is_vegetarian) {
    tags.push({ icon: "🌱", label: "Végétarien", bg: "bg-emerald-50", fg: "text-emerald-700" });
  }
  if (item.is_vegan) {
    tags.push({ icon: "🥬", label: "Vegan", bg: "bg-emerald-100", fg: "text-emerald-800" });
  }
  if (item.is_lactose_free) {
    tags.push({ icon: "🥛", label: "Sans lactose", bg: "bg-blue-50", fg: "text-blue-800" });
  }
  if (item.is_gluten_free) {
    tags.push({ icon: "🌾", label: "Sans gluten", bg: "bg-amber-50", fg: "text-amber-800" });
  }
  if (item.is_halal) {
    tags.push({ icon: "🕌", label: "Halal", bg: "bg-teal-50", fg: "text-teal-800" });
  }
  if (item.is_spicy) {
    tags.push({ icon: "🌶", label: "Piquant", bg: "bg-rialto/10", fg: "text-rialto" });
  }
  if (item.is_kids_friendly) {
    tags.push({ icon: "👶", label: "Adapté aux enfants", bg: "bg-pink-50", fg: "text-pink-800" });
  }
  if (item.tags?.includes("seafood")) {
    tags.push({ icon: "🐟", label: "Fruits de mer", bg: "bg-sky-50", fg: "text-sky-800" });
  }
  if (item.tags?.includes("meat")) {
    tags.push({ icon: "🥩", label: "Viande", bg: "bg-rose-50", fg: "text-rose-800" });
  }
  if (item.tags?.includes("anatolian")) {
    tags.push({ icon: "🇹🇷", label: "Anatolien", bg: "bg-saffron/15", fg: "text-saffron-dark" });
  }
  return tags;
}

export default function ProductPageClient({
  item,
  options,
  similar = [],
}: {
  item: EnrichedItem;
  options: MenuItemOption[];
  similar?: MenuItem[];
}) {
  const router = useRouter();
  const image = item.image_url || matchDishImage(item.name, item.category_name);
  const description = item.description_long ?? item.description ?? "";
  const tags = dietTags(item);
  const allergens = item.allergens ?? [];
  const ingredients = item.ingredients ?? [];

  const optionGroups = useMemo(() => {
    const map: Record<string, MenuItemOption[]> = {};
    for (const o of options) {
      (map[o.option_group] ??= []).push(o);
    }
    return Object.entries(map);
  }, [options]);

  const [qty, setQty] = useState(1);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [notes, setNotes] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);
  const [added, setAdded] = useState(false);

  // Phase 7 FIX 1 : guard adresse qualifiée, redirect vers / avec toast
  useEffect(() => {
    if (!readAddress()) {
      router.replace("/?need_address=1");
    }
  }, [router]);

  const toggleOption = (group: string, name: string, max: number) => {
    setSelected((prev) => {
      const curr = prev[group] ?? [];
      if (max === 1) return { ...prev, [group]: [name] };
      if (curr.includes(name))
        return { ...prev, [group]: curr.filter((n) => n !== name) };
      if (curr.length >= max) return prev;
      return { ...prev, [group]: [...curr, name] };
    });
  };

  const flatSelected: CartOptionSelection[] = useMemo(() => {
    const out: CartOptionSelection[] = [];
    for (const [group, names] of Object.entries(selected)) {
      for (const name of names) {
        const opt = options.find(
          (o) => o.option_group === group && o.option_name === name,
        );
        if (opt) {
          out.push({ group, name, extra_price: Number(opt.extra_price) });
        }
      }
    }
    return out;
  }, [selected, options]);

  const missingRequiredGroups = optionGroups.filter(([group, opts]) => {
    const required = opts.some((o) => o.is_required);
    return required && (selected[group]?.length ?? 0) === 0;
  });
  const canAdd = missingRequiredGroups.length === 0 && item.is_available;

  const extras = flatSelected.reduce((s, o) => s + o.extra_price, 0);
  const total = (Number(item.price) + extras) * qty;

  function addToCart() {
    if (!canAdd) return;
    const unitPrice = Number(item.price) + extras;
    const key = cartLineKey(item.id, flatSelected, notes.trim());
    const current = readCart();
    const existing = current.find((c) => c.key === key);
    let next;
    if (existing) {
      next = current.map((c) =>
        c.key === key
          ? {
              ...c,
              quantity: c.quantity + qty,
              subtotal: unitPrice * (c.quantity + qty),
            }
          : c,
      );
    } else {
      next = [
        ...current,
        {
          key,
          menu_item_id: item.id,
          name: item.name,
          base_price: Number(item.price),
          quantity: qty,
          options: flatSelected,
          notes: notes.trim(),
          unit_price: unitPrice,
          subtotal: unitPrice * qty,
        },
      ];
    }
    writeCart(next);
    setAdded(true);
    setTimeout(() => {
      router.push("/menu");
    }, 800);
  }

  const showReadMore = description.length > 400;
  const displayedDesc = descExpanded ? description : description.slice(0, 400);

  return (
    <main className="min-h-screen bg-cream pb-32">
      {/* Hero photo */}
      <section className="relative h-64 w-full overflow-hidden bg-ink md:h-96">
        <Image
          src={image}
          alt={item.name}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
        {/* Bouton retour */}
        <Link
          href="/menu"
          className="absolute left-4 top-5 inline-flex h-10 items-center gap-1.5 rounded-full bg-white/95 px-4 text-sm font-medium text-ink shadow-card backdrop-blur-lg transition hover:bg-white md:left-5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Menu
        </Link>
      </section>

      <div className="container-hero -mt-6 md:-mt-10">
        <article className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-pop md:p-10">
          {/* Catégorie breadcrumb */}
          {item.category_name && (
            <span className="eyebrow">{item.category_name}</span>
          )}
          <h1 className="mt-3 font-display text-h1 font-bold leading-tight">
            {item.name}
          </h1>
          <div className="mt-4 flex items-baseline gap-3">
            <span className="tabular font-display text-3xl font-bold text-rialto md:text-4xl">
              {formatCHF(Number(item.price))}
            </span>
            {!item.is_available && (
              <span className="rounded-full bg-ink/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-mute">
                Épuisé
              </span>
            )}
          </div>

          {/* Tags régime */}
          {tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t.label}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${t.bg} ${t.fg}`}
                >
                  <span className="text-sm leading-none">{t.icon}</span>
                  {t.label}
                </span>
              ))}
            </div>
          )}

          {/* Description */}
          {description && (
            <div className="mt-6">
              <h2 className="mb-2 font-display text-lg font-semibold">
                Description
              </h2>
              <p className="text-base leading-relaxed text-ink/85">
                {displayedDesc}
                {showReadMore && !descExpanded && "… "}
                {showReadMore && (
                  <button
                    type="button"
                    onClick={() => setDescExpanded(!descExpanded)}
                    className="text-sm font-semibold text-rialto underline"
                  >
                    {descExpanded ? "Réduire" : "Lire plus"}
                  </button>
                )}
              </p>
            </div>
          )}

          {/* Ingrédients */}
          {ingredients.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 font-display text-lg font-semibold">
                Ingrédients
              </h2>
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-ink/85">
                {ingredients.map((ing) => (
                  <li key={ing} className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-rialto" />
                    {ing}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Allergènes */}
          {allergens.length > 0 && (
            <div className="mt-6 rounded-2xl border-2 border-saffron bg-saffron/10 p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 text-xl">⚠️</div>
                <div className="flex-1">
                  <h2 className="font-display text-base font-semibold">
                    Allergènes
                  </h2>
                  <p className="mt-1 text-sm text-ink/85">
                    Ce plat contient :{" "}
                    <strong>
                      {allergens
                        .map((a) => ALLERGEN_LABELS[a] ?? a)
                        .join(", ")
                        .toLowerCase()}
                    </strong>
                    .
                  </p>
                  <p className="mt-2 text-[11px] text-ink/60">
                    Pour toute allergie grave, contactez le restaurant avant
                    de commander.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Options */}
          {optionGroups.length > 0 && (
            <div className="mt-6 space-y-5">
              {optionGroups.map(([group, opts]) => {
                const maxSel = Math.max(
                  1,
                  ...opts.map((o) => o.max_selections || 1),
                );
                const required = opts.some((o) => o.is_required);
                return (
                  <div key={group}>
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <h3 className="font-display text-base font-semibold">
                        {group}
                      </h3>
                      <span className="text-xs text-mute">
                        {required ? "Requis · " : ""}
                        {maxSel === 1 ? "Choix unique" : `Max ${maxSel}`}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {opts.map((o) => {
                        const isSel = (selected[group] ?? []).includes(
                          o.option_name,
                        );
                        return (
                          <label
                            key={o.id}
                            className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                              isSel
                                ? "border-rialto bg-rialto/5"
                                : "border-border bg-white hover:border-ink"
                            }`}
                          >
                            <span className="flex items-center gap-3">
                              <input
                                type={maxSel === 1 ? "radio" : "checkbox"}
                                checked={isSel}
                                onChange={() =>
                                  toggleOption(group, o.option_name, maxSel)
                                }
                                className="accent-rialto"
                                name={group}
                              />
                              <span className="font-medium">
                                {o.option_name}
                              </span>
                            </span>
                            {o.extra_price > 0 && (
                              <span className="tabular text-xs font-semibold text-mute">
                                +{formatCHF(Number(o.extra_price))}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Notes + quantité */}
          <div className="mt-6">
            <h3 className="mb-2 font-display text-base font-semibold">
              Instructions particulières
            </h3>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: bien cuite, sans oignons…"
              className="input resize-none text-sm"
              maxLength={200}
            />
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <h3 className="font-display text-base font-semibold">Quantité</h3>
            <div className="inline-flex items-center gap-3 rounded-full border border-border bg-white p-1">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full font-semibold text-ink transition hover:bg-cream disabled:opacity-40"
                disabled={qty <= 1}
              >
                −
              </button>
              <span className="min-w-[24px] text-center tabular font-display text-lg font-semibold">
                {qty}
              </span>
              <button
                type="button"
                onClick={() => setQty(qty + 1)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full font-semibold text-ink transition hover:bg-cream"
              >
                +
              </button>
            </div>
          </div>
        </article>
      </div>

      {/* Phase 11 C13 : suggestions similaires */}
      {similar.length > 0 && (
        <section className="container-hero pb-24 pt-4">
          <h2 className="mb-4 font-display text-xl font-bold">
            Tu pourrais aussi aimer
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {similar.slice(0, 4).map((s) => (
              <a
                key={s.id}
                href={`/menu/${(s.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${s.id.replace(/-/g, "").slice(0, 8)}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
              >
                <div
                  className="aspect-square w-full bg-cream bg-cover bg-center"
                  style={{
                    backgroundImage: `url('${s.image_url || matchDishImage(s.name, item.category_name)}')`,
                  }}
                />
                <div className="p-3">
                  <div className="line-clamp-1 font-display font-semibold text-ink">
                    {s.name}
                  </div>
                  <div className="tabular mt-0.5 text-sm font-bold text-rialto">
                    {formatCHF(Number(s.price))}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* CTA sticky bas */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-white/95 backdrop-blur-lg">
        <div className="container-hero py-3">
          {missingRequiredGroups.length > 0 && (
            <p className="mb-2 text-center text-xs text-rialto">
              Sélectionnez :{" "}
              {missingRequiredGroups.map(([g]) => g).join(", ")}
            </p>
          )}
          <button
            type="button"
            onClick={addToCart}
            disabled={!canAdd || added}
            className="btn-primary-lg w-full"
          >
            {added
              ? "✓ Ajouté au panier"
              : `Ajouter au panier · ${formatCHF(total)}`}
          </button>
        </div>
      </div>
    </main>
  );
}
