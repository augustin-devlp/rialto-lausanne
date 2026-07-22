import JoinClient from "./JoinClient";

// Métadonnée STATIQUE : volontairement sans chiffre de barème. Elle ne peut
// pas suivre le réglage du dashboard (rendue au build), donc affirmer ici
// « 1 pizza après 10 tampons » la figerait et la rendrait fausse au premier
// changement. Le barème réel est affiché dans la page, lu à la source.
export const metadata = {
  title: "Rejoindre Rialto Club · Rialto",
  description:
    "Créez votre carte de fidélité Rialto gratuitement : cumulez des tampons sur vos commandes et gagnez des récompenses.",
};

export default function JoinPage() {
  return <JoinClient />;
}
