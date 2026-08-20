import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    // Refonte UI lot 1 (20.08.2026) : échelle de rayons ÉCRASÉE (pas
    // étendue) — tout le site descend vers le quasi-carré d'un coup, par
    // les tokens, sans réécrire les classes rounded-* existantes.
    // `btn` = token dédié aux boutons d'action (léger surplus de rayon,
    // proposition acceptée par Augustin — à trancher visuellement).
    // `full` conservé : pastilles, badges et points de statut restent ronds.
    borderRadius: {
      none: "0",
      sm: "2px",
      DEFAULT: "4px",
      md: "4px",
      lg: "4px",
      xl: "4px",
      "2xl": "6px",
      "3xl": "6px",
      btn: "10px",
      full: "9999px",
    },
    extend: {
      colors: {
        // Palette "Italien chaleureux" — terracotta + crème + safran.
        // rialto = terracotta italien (remplace l'ancien #E30613 trop vif)
        rialto: {
          DEFAULT: "#C73E1D",
          dark: "#A02E14",
          50: "#FAEEE9",
          100: "#F2D6CB",
          500: "#C73E1D",
          700: "#8F2D16",
        },
        cream: {
          DEFAULT: "#F9F1E4",
          dark: "#EFE4CE",
        },
        saffron: {
          DEFAULT: "#E6A12C",
          dark: "#C48617",
        },
        ink: "#1A1A1A",
        mute: "#6B6B6B",
        // Refonte UI lot 1 : surface blanche (le beige quitte les fonds),
        // liseré gris neutre à peine visible (l'ancien #E8E3D8 tirait
        // beige). `cream` reste défini : accents/badges + dashboard.
        surface: "#FFFFFF",
        border: "#ECECEC",
      },
      fontFamily: {
        // Remplies par next/font dans layout.tsx via CSS variables
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        serif: ["var(--font-fraunces)", "Georgia", "serif"],
      },
      fontSize: {
        // Échelle éditoriale : titres en Fraunces plus généreux
        "display": ["clamp(2.5rem, 6vw, 5rem)", { lineHeight: "1.02", letterSpacing: "-0.02em" }],
        "h1": ["clamp(2rem, 4.5vw, 3.25rem)", { lineHeight: "1.05", letterSpacing: "-0.015em" }],
        "h2": ["clamp(1.5rem, 3vw, 2.25rem)", { lineHeight: "1.1", letterSpacing: "-0.01em" }],
      },
      boxShadow: {
        // Refonte UI lot 1 : les cartes vivent du liseré, plus de l'ombre.
        card: "0 1px 2px rgba(26,26,26,.04)",
        pop: "0 20px 50px -10px rgba(26,26,26,.15), 0 8px 20px -8px rgba(26,26,26,.1)",
        hover: "0 12px 32px -8px rgba(199,62,29,.18)",
      },
      animation: {
        "fade-up": "fadeUp 500ms cubic-bezier(0.16,1,0.3,1) both",
        "fade-in": "fadeIn 400ms ease-out both",
        "pulse-ring": "pulseRing 1.6s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        pulseRing: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(199,62,29,0.4)" },
          "50%": { boxShadow: "0 0 0 12px rgba(199,62,29,0)" },
        },
      },
      maxWidth: {
        "container": "1280px",
        "prose-wide": "68ch",
      },
    },
  },
  plugins: [],
};
export default config;
