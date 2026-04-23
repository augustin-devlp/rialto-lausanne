"use client";

/**
 * LanguageToggle — Phase 11 C10.
 * Dropdown de sélection de langue 4 drapeaux (FR/EN/DE/IT).
 */

import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/I18nProvider";
import { LOCALE_META, LOCALES, type Locale } from "@/i18n/dictionaries";

export default function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink hover:shadow-card"
        aria-label="Changer de langue"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{LOCALE_META[locale].flag}</span>
        <span className="hidden sm:inline">{locale.toUpperCase()}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-40 overflow-hidden rounded-2xl border border-border bg-white shadow-pop">
          {LOCALES.map((l: Locale) => (
            <button
              key={l}
              type="button"
              onClick={() => {
                setLocale(l);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition ${
                locale === l ? "bg-rialto/10 text-rialto font-semibold" : "hover:bg-cream"
              }`}
            >
              <span className="text-base">{LOCALE_META[l].flag}</span>
              <span>{LOCALE_META[l].label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
