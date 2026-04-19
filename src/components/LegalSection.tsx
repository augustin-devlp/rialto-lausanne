"use client";

export default function LegalSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">
          Mentions légales
        </h2>
        <p className="mt-2 text-sm text-mute">
          Informations sur l'éditeur, les cookies et le traitement des données.
        </p>
      </header>

      <div className="mt-6 space-y-6 rounded-2xl border border-gray-200 bg-white p-8 text-sm leading-relaxed text-ink shadow-card">
        <section>
          <h3 className="mb-2 text-base font-bold">Éditeur du site</h3>
          <p>
            <strong>Rialto</strong>
            <br />
            Avenue de Béthusy 29B, 1012 Lausanne, Suisse
            <br />
            Téléphone : <a href="tel:+41213126460" className="text-rialto hover:underline">+41 21 312 64 60</a>
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-bold">Hébergement</h3>
          <p>
            Site hébergé par Vercel Inc., 440 N Barranca Ave #4133, Covina,
            CA 91723, USA.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-bold">Données personnelles</h3>
          <p>
            Les informations que vous saisissez lors d'une commande (nom,
            téléphone, heure de retrait, commande) sont uniquement utilisées
            pour traiter votre commande et vous notifier de son avancement
            par SMS. Elles ne sont jamais cédées à des tiers.
          </p>
          <p className="mt-2">
            Vous pouvez demander la suppression de vos données en nous
            contactant par téléphone.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-bold">Cookies</h3>
          <p>
            Ce site utilise uniquement des cookies techniques (panier en
            cours, préférence d'affichage). Aucun cookie de tracking
            publicitaire n'est déposé.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-bold">Paiement</h3>
          <p>
            Les commandes sont payables uniquement en magasin, en espèces ou
            par TWINT. Aucune donnée bancaire n'est demandée ni stockée par
            ce site.
          </p>
        </section>

        <section>
          <h3 className="mb-2 text-base font-bold">Propulsé par Stampify</h3>
          <p className="text-mute">
            Solution de commande en ligne fournie par{" "}
            <a
              href="https://stampify.ch"
              target="_blank"
              rel="noopener noreferrer"
              className="text-rialto hover:underline"
            >
              Stampify
            </a>
            .
          </p>
        </section>
      </div>
    </section>
  );
}
