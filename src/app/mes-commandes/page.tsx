import MesCommandesClient from "./MesCommandesClient";

export const metadata = {
  title: "Mes commandes · Rialto",
  description: "Historique de vos commandes Rialto.",
};

export default function MesCommandesPage() {
  return <MesCommandesClient />;
}
