"use client";

/**
 * LienAccueil — LE lien de retour « vers le début », qui ne ment jamais.
 *
 * LE PROBLÈME QU'IL SUPPRIME (décision Augustin 21.08, 4e occurrence de
 * cette famille) : pour un client DÉJÀ QUALIFIÉ, la home n'est plus qu'un
 * sas — elle le rebondit aussitôt vers /menu (redirect serveur au cookie
 * `rialto_adresse`, puis filet client RetourClient). Un lien « Accueil »
 * qui mène à un rebond est une contradiction : on la SUPPRIME au lieu de
 * la contourner par une cinquième exemption.
 *
 * Règle : si le client a une adresse qualifiée, le lien s'appelle « Le
 * menu » et pointe /menu — là où il finissait de toute façon. Sinon, la
 * home garde tout son sens (c'est la QUALIFICATION INITIALE) et le lien
 * s'appelle « Accueil ».
 *
 * ⚠️ Le libellé et la cible bougent ENSEMBLE, jamais l'un sans l'autre :
 * un lien « Accueil » qui mène au menu serait le même bug déplacé.
 *
 * Hydratation : rendu neutre (« Accueil » → /) au premier passage, puis
 * bascule après montage — même patron que l'AppHeader, dont le logo
 * pointe déjà /menu pour un client qualifié.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { readAddress } from "@/lib/clientStore";

type Props = {
  className?: string;
  /** Affiche la flèche « ← » devant le libellé (retours de page). */
  avecFleche?: boolean;
  children?: never;
};

export default function LienAccueil({ className, avecFleche }: Props) {
  const [qualifie, setQualifie] = useState(false);

  useEffect(() => {
    const sync = () => setQualifie(readAddress() !== null);
    sync();
    // L'adresse peut être posée ou purgée pendant la vie de la page (le
    // pop-up partagé diffuse cet événement) : le lien suit.
    window.addEventListener("rialto:address-updated", sync);
    return () => window.removeEventListener("rialto:address-updated", sync);
  }, []);

  return (
    <Link href={qualifie ? "/menu" : "/"} className={className}>
      {avecFleche ? "← " : ""}
      {qualifie ? "Le menu" : "Accueil"}
    </Link>
  );
}
