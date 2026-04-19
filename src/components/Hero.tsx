"use client";

import type { TabKey } from "./RialtoHome";

type Props = {
  activeTab: TabKey;
  onSelect: (t: TabKey) => void;
};

const TABS: { key: TabKey; label: string }[] = [
  { key: "menu", label: "Menu" },
  { key: "avis", label: "Avis" },
  { key: "contact", label: "Contact" },
  { key: "legal", label: "Mentions légales" },
  { key: "fidelite", label: "Fidélité" },
];

export default function Hero({ activeTab, onSelect }: Props) {
  return (
    <section
      className="relative isolate flex flex-col items-center justify-center text-center"
      style={{
        minHeight: "100vh",
        backgroundImage: "url(/images/hero-background.jpg)",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Overlay sombre */}
      <div className="absolute inset-0 bg-black/55" aria-hidden />

      {/* Nav top */}
      <nav
        className="absolute left-0 right-0 top-0 z-10 px-4 pt-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 1.25rem)" }}
      >
        <ul className="mx-auto flex max-w-4xl items-center justify-center gap-1 overflow-x-auto scrollbar-none">
          {TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => onSelect(t.key)}
                  className={`whitespace-nowrap rounded px-4 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-white text-black shadow-sm"
                      : "text-white hover:bg-white/10"
                  }`}
                >
                  {t.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Logo + titre centrés */}
      <div className="relative z-10 flex flex-col items-center px-4">
        <img
          src="https://static.takeaway.com/images/restaurants/ch/0R0QOO11/logo_465x320.png"
          alt="Logo Rialto"
          className="mb-6 animate-[fadeIn_0.6s_ease-out] drop-shadow-2xl"
          style={{ width: "clamp(200px, 28vw, 300px)", height: "auto", objectFit: "contain" }}
        />
        <h1
          className="font-bold text-white"
          style={{
            fontFamily: "'Fraunces', 'Playfair Display', Georgia, serif",
            fontSize: "clamp(48px, 8vw, 72px)",
            letterSpacing: "0.05em",
            textShadow: "0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          RIALTO
        </h1>
      </div>

      {/* Chevron vers le contenu */}
      <button
        type="button"
        aria-label="Voir le contenu"
        onClick={() => {
          const el = document.getElementById("tab-content");
          if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 20;
            window.scrollTo({ top: y, behavior: "smooth" });
          }
        }}
        className="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/10 p-3 text-white backdrop-blur-sm transition hover:bg-white/20"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5 animate-bounce"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}
