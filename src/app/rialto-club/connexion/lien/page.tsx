import { Suspense } from "react";
import ConnexionLienClient from "./ConnexionLienClient";

export const dynamic = "force-dynamic";

/**
 * Page d'arrivée du lien de connexion par e-mail.
 *
 * ⚠️ `noindex` : l'URL porte l'adresse e-mail et le jeton. Elle n'a rien à
 * faire dans un index, et un moteur qui la suivrait consommerait le lien.
 */
export const metadata = {
  title: "Connexion — Rialto Club",
  robots: { index: false, follow: false },
};

export default function PageConnexionLien() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-cream">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
        </div>
      }
    >
      <ConnexionLienClient />
    </Suspense>
  );
}
