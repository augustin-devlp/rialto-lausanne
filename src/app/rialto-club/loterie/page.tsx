import ClubPlaceholder from "../ClubPlaceholder";

export const metadata = {
  title: "Loterie · Rialto Club",
  description: "Tirage au sort mensuel pour les membres Rialto Club.",
};

export default function LoteriePage() {
  return (
    <ClubPlaceholder
      eyebrow="Rialto Club"
      title="Loterie du mois"
      emoji="🎟️"
      description="Chaque mois, un tirage au sort parmi les membres Rialto Club. Reste connecté — on t'enverra un SMS si tu gagnes."
      cta={{ label: "Voir ma carte fidélité", href: "/rialto-club/join" }}
    />
  );
}
