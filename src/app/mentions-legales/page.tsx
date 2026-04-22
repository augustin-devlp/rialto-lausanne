import LegalPage from "@/components/layout/LegalPage";
import { RIALTO_INFO } from "@/lib/rialto-data";

export const metadata = {
  title: "Mentions légales · Rialto",
  description: "Informations légales du restaurant Rialto à Lausanne.",
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage
      title="Mentions légales"
      subtitle="Informations réglementaires sur l'éditeur du site et le restaurant Rialto."
      updatedAt="22 avril 2026"
    >
      <section>
        <h2>Éditeur du site</h2>
        <p>
          Le site <strong>rialto-lausanne.vercel.app</strong> est édité par :
        </p>
        <p>
          <strong>Pizzeria Rialto</strong>
          <br />
          {RIALTO_INFO.address}
          <br />
          Téléphone :{" "}
          <a href={`tel:${RIALTO_INFO.phoneTel}`}>{RIALTO_INFO.phoneDisplay}</a>
        </p>
      </section>

      <section>
        <h2>Hébergement technique</h2>
        <p>
          Le site est hébergé par <strong>Vercel Inc.</strong>, 440 N Barranca
          Ave #4133, Covina, CA 91723, États-Unis (<a href="https://vercel.com" target="_blank" rel="noopener noreferrer">vercel.com</a>).
        </p>
        <p>
          La plateforme technique de gestion des commandes et de la fidélité
          est fournie par <strong>Stampify</strong> (<a href="https://stampify.ch" target="_blank" rel="noopener noreferrer">stampify.ch</a>).
        </p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          L&apos;ensemble du contenu (textes, images, logos, marques) présent
          sur ce site est la propriété exclusive de la Pizzeria Rialto ou de
          ses partenaires, sauf mention contraire. Toute reproduction, même
          partielle, est interdite sans autorisation écrite préalable.
        </p>
      </section>

      <section>
        <h2>Responsabilité</h2>
        <p>
          Les informations figurant sur ce site (menu, prix, horaires) sont
          données à titre indicatif et peuvent être modifiées sans préavis. Le
          restaurant s&apos;efforce d&apos;en garantir l&apos;exactitude mais
          ne saurait être tenu responsable d&apos;erreurs ou d&apos;omissions.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Pour toute question relative au site ou au restaurant, contactez-nous
          par téléphone au{" "}
          <a href={`tel:${RIALTO_INFO.phoneTel}`}>{RIALTO_INFO.phoneDisplay}</a>{" "}
          ou directement à l&apos;adresse : {RIALTO_INFO.address}.
        </p>
      </section>
    </LegalPage>
  );
}
