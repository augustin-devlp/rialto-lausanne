import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rialto: { DEFAULT: "#E30613", dark: "#B30510" },
        ink: "#1a1a1a",
        mute: "#6b7280",
        surface: "#f9fafb",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
        pop: "0 10px 30px rgba(0,0,0,.12)",
      },
      animation: {
        pulseRing: "pulseRing 1.6s cubic-bezier(0.4,0,0.6,1) infinite",
      },
      keyframes: {
        pulseRing: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(227,6,19,0.5)" },
          "50%": { boxShadow: "0 0 0 10px rgba(227,6,19,0)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
