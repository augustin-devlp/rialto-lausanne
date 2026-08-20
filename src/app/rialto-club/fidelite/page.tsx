import FideliteSection from "@/components/FideliteSection";

export const metadata = {
  title: "Ma carte fidélité · Rialto Club",
  description:
    "Votre carte Rialto Club : tampons, récompenses, roue et loterie.",
};

/**
 * Page Fidélité (04.08.2026) — re-route FideliteSection, orphelin depuis la
 * suppression de l'arbre v1 (il vivait dans l'onglet Club de l'ancienne
 * home). C'est LA page où un client voit sa carte : StampRow, barème
 * dynamique, historique, ponts roue/loterie/avis.
 */
export default function FidelitePage() {
  return (
    <main className="min-h-screen bg-white pb-12 pt-10 md:pt-14">
      <FideliteSection />
    </main>
  );
}
