"use client";

import type { MenuCategory } from "@/lib/types";

type Props = {
  categories: MenuCategory[];
  activeId: string | null;
  onSelect: (id: string) => void;
};

export default function CategoryNav({ categories, activeId, onSelect }: Props) {
  return (
    <nav className="border-b border-gray-100 bg-white">
      <div className="mx-auto flex max-w-6xl overflow-x-auto scrollbar-none px-2">
        {categories.map((cat) => {
          const active = cat.id === activeId;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat.id)}
              className={`relative whitespace-nowrap px-4 py-3 text-sm font-medium transition ${
                active ? "text-rialto" : "text-mute hover:text-ink"
              }`}
            >
              <span className="mr-1">{cat.icon}</span>
              {cat.name}
              {active && (
                <span className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full bg-rialto" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
