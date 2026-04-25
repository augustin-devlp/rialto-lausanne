import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";
import HamburgerMenu from "@/components/layout/HamburgerMenu";
import RialtoLogo from "@/components/brand/RialtoLogo";
import PwaRegister from "@/components/PwaRegister";
import { I18nProvider } from "@/i18n/I18nProvider";
import LanguageToggle from "@/components/LanguageToggle";
import GoogleAnalytics from "@/components/analytics/GoogleAnalytics";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-fraunces",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// Phase 11 C5 : PWA viewport + theme color
export const viewport: Viewport = {
  themeColor: "#C73E1D",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: "Rialto — Pizzeria & livraison à Lausanne",
  description:
    "Commandez vos pizzas Rialto livrées en 30 min à Lausanne et environs. Pizzas artisanales, spécialités anatoliennes, paiement au livreur.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Rialto",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Rialto — Pizzeria & livraison à Lausanne",
    description:
      "Pizzas à 22 CHF, faites devant toi. Livré en 30 min. Paie au livreur.",
    locale: "fr_CH",
    type: "website",
    images: [
      {
        url: "https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1200&auto=format&fit=crop&q=80",
        width: 1200,
        height: 630,
        alt: "Pizza Rialto sortie du four",
      },
    ],
  },
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23F9F1E4'/%3E%3Ctext x='50%25' y='58%25' text-anchor='middle' font-family='Georgia,serif' font-size='20' font-weight='700' fill='%23C73E1D'%3ER%3C/text%3E%3C/svg%3E",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-sans antialiased bg-cream text-ink">
        {/* Logo Rialto top-left fixed, cliquable -> / (Phase 7 FIX 3) */}
        <I18nProvider>
          <RialtoLogo variant="fixed" size="sm" />
          <HamburgerMenu />
          {/* Phase 11 C10 : sélecteur de langue flottant top-right */}
          <div className="fixed right-3 top-3 z-40 md:right-6 md:top-5">
            <LanguageToggle />
          </div>
          {children}
          <PwaRegister />
          <GoogleAnalytics />
        </I18nProvider>
      </body>
    </html>
  );
}
