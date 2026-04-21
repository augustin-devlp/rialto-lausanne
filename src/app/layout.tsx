import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "Rialto — Pizzeria & livraison à Lausanne",
  description:
    "Commandez vos pizzas Rialto livrées en 30 min à Lausanne et environs. Pizzas artisanales, spécialités anatoliennes, paiement au livreur.",
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
        {children}
      </body>
    </html>
  );
}
