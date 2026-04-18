"use client";

export type FilterKind = "all" | "veg" | "spicy";

type Props = {
  value: FilterKind;
  onChange: (v: FilterKind) => void;
  search: string;
  onSearch: (v: string) => void;
};

export default function Filters({ value, onChange, search, onSearch }: Props) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <div className="flex flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 min-w-[200px] focus-within:border-rialto">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 text-mute"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          placeholder="Rechercher un plat…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-mute"
        />
      </div>
      <button
        type="button"
        className={`chip ${value === "all" ? "chip-active" : ""}`}
        onClick={() => onChange("all")}
      >
        Tout
      </button>
      <button
        type="button"
        className={`chip ${value === "veg" ? "chip-active" : ""}`}
        onClick={() => onChange(value === "veg" ? "all" : "veg")}
      >
        🌱 Végétarien
      </button>
      <button
        type="button"
        className={`chip ${value === "spicy" ? "chip-active" : ""}`}
        onClick={() => onChange(value === "spicy" ? "all" : "spicy")}
      >
        🌶️ Épicé
      </button>
    </div>
  );
}
