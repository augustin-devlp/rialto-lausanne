import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rialto Lausanne — Commandez en ligne",
  description:
    "Commandez vos pizzas et plats Rialto en ligne. Retrait en magasin, paiement sur place. Avenue de Béthusy 29, Lausanne.",
  openGraph: {
    title: "Rialto Lausanne — Commandez en ligne",
    description:
      "Pizzas, pâtes, plats cuisinés. Retrait en magasin, paiement sur place.",
    locale: "fr_CH",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
