import ClubPlaceholder from "../ClubPlaceholder";

export const metadata = {
  title: "Roue de la chance · Rialto Club",
  description: "Tente ta chance à la roue Rialto pour gagner des récompenses.",
};

export default function RouePage() {
  return (
    <ClubPlaceholder
      eyebrow="Rialto Club"
      title="Roue de la chance"
      emoji="🎰"
      description="Bientôt disponible ici. En attendant, tu peux tourner la roue depuis la page de confirmation d'une commande."
      cta={{ label: "Commander maintenant", href: "/menu" }}
    />
  );
}
