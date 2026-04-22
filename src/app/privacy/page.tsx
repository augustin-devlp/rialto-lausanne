import LegalPage from "@/components/layout/LegalPage";
import { RIALTO_INFO } from "@/lib/rialto-data";

export const metadata = {
  title: "Politique de confidentialité · Rialto",
  description:
    "Comment Rialto collecte, utilise et protège vos données personnelles.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      subtitle="Comment nous traitons vos données personnelles en conformité avec la LPD suisse et le RGPD."
      updatedAt="22 avril 2026"
    >
      <section>
        <h2>Responsable du traitement</h2>
        <p>
          <strong>Pizzeria Rialto</strong>
          <br />
          {RIALTO_INFO.address}
          <br />
          Téléphone :{" "}
          <a href={`tel:${RIALTO_INFO.phoneTel}`}>{RIALTO_INFO.phoneDisplay}</a>
        </p>
        <p>
          Le traitement technique des données (commandes, fidélité) est
          délégué à notre partenaire <strong>Stampify</strong> en qualité de
          sous-traitant, dans le respect d&apos;un contrat de traitement.
        </p>
      </section>

      <section>
        <h2>Données collectées</h2>
        <p>Lors d&apos;une commande, nous collectons :</p>
        <ul>
          <li>Nom et prénom</li>
          <li>Numéro de téléphone</li>
          <li>Adresse de livraison (rue, code postal, étage)</li>
          <li>Instructions livreur (facultatif)</li>
          <li>Contenu et montant de la commande</li>
        </ul>
        <p>
          Lors de la création d&apos;une carte Rialto Club, nous collectons
          en plus votre prénom pour personnaliser le service.
        </p>
        <p>
          Nous <strong>ne collectons aucune donnée bancaire</strong>, aucun
          mot de passe, aucune information sensible.
        </p>
      </section>

      <section>
        <h2>Utilisation des données</h2>
        <p>Vos données servent uniquement à :</p>
        <ul>
          <li>Traiter et livrer votre commande</li>
          <li>Vous envoyer des SMS de suivi (confirmation, préparation, livraison)</li>
          <li>
            Gérer votre programme fidélité si vous avez une carte Rialto Club
          </li>
          <li>
            Vous envoyer ponctuellement des offres de fidélité (spin wheel,
            tombola), que vous pouvez désactiver à tout moment
          </li>
        </ul>
        <p>
          Nous ne partageons jamais vos données avec des tiers à des fins
          publicitaires.
        </p>
      </section>

      <section>
        <h2>Durée de conservation</h2>
        <p>
          Les données de commande sont conservées 10 ans pour des raisons
          comptables (article 958f CO). Les données fidélité sont conservées
          tant que votre compte est actif, puis supprimées après 2 ans
          d&apos;inactivité.
        </p>
      </section>

      <section>
        <h2>Vos droits</h2>
        <p>
          Conformément à la LPD suisse et au RGPD, vous disposez des droits :
        </p>
        <ul>
          <li>D&apos;accès à vos données</li>
          <li>De rectification</li>
          <li>De suppression</li>
          <li>De limitation du traitement</li>
          <li>D&apos;opposition à recevoir des SMS marketing</li>
        </ul>
        <p>
          Pour exercer ces droits, contactez-nous au{" "}
          <a href={`tel:${RIALTO_INFO.phoneTel}`}>{RIALTO_INFO.phoneDisplay}</a>
          {" "}ou en vous rendant au restaurant.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          Ce site utilise uniquement des cookies techniques nécessaires à son
          fonctionnement (session de commande, panier). Aucun cookie
          publicitaire ou de suivi tiers n&apos;est installé sans votre
          consentement explicite.
        </p>
      </section>
    </LegalPage>
  );
}
