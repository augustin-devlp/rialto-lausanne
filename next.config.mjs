/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  async redirects() {
    return [
      // Neutralisation de la page legacy /order/[id] (2026 — coordination
      // durcissement RLS caisse) : seul lecteur ANON de orders/order_items.
      // La base active n'a aucune commande historique : aucun lien /order/*
      // valide n'existe. Le suivi vit sur /confirmation/[orderNumber].
      {
        source: "/order/:id*",
        destination: "/",
        permanent: true,
      },
    ];
  },
};
export default nextConfig;
