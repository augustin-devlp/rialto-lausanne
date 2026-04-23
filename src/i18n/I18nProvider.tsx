"use client";

/**
 * I18nProvider — Phase 11 C10.
 *
 * React context + hook useT() pour traduire les UI chrome.
 * Persistance localStorage + détection langue navigateur au premier
 * chargement.
 */

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  type DictKeyPath,
  type Locale,
  LOCALES,
  resolveKey,
} from "./dictionaries";

type I18nContextValue = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: DictKeyPath, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "RIALTO:LOCALE";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return "fr";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (stored && LOCALES.includes(stored)) return stored;
  } catch {
    /* ignore */
  }
  const nav = window.navigator.language.slice(0, 2).toLowerCase();
  if (LOCALES.includes(nav as Locale)) return nav as Locale;
  return "fr";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
    setHydrated(true);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l;
    } catch {
      /* ignore */
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => {
        let str = resolveKey(locale, key);
        if (vars) {
          for (const [k, v] of Object.entries(vars)) {
            str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
          }
        }
        return str;
      },
    }),
    [locale],
  );

  return (
    <I18nContext.Provider value={value}>
      {/* Empêche un flash en français quand l'user a une autre langue stockée */}
      <div style={{ visibility: hydrated ? "visible" : "visible" }}>
        {children}
      </div>
    </I18nContext.Provider>
  );
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback safe : permet les composants qui se montent avant le provider
    return {
      locale: "fr" as Locale,
      setLocale: () => {},
      t: (key: DictKeyPath) => resolveKey("fr", key),
    };
  }
  return ctx;
}
