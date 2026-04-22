import LegalPage from "@/components/layout/LegalPage";
import { RIALTO_INFO } from "@/lib/rialto-data";

export const metadata = {
  title: "Conditions générales de vente · Rialto",
  description: "Conditions générales de vente en ligne du restaurant Rialto.",
};

export default function CGVPage() {
  return (
    <LegalPage
      title="Conditions générales de vente"
      subtitle="Règles applicables aux commandes passées sur rialto-lausanne.vercel.app."
      updatedAt="22 avril 2026"
    >
      <section>
        <h2>1. Objet</h2>
        <p>
          Les présentes conditions régissent les ventes de produits
          alimentaires via le site <strong>rialto-lausanne.vercel.app</strong>{" "}
          par la Pizzeria Rialto ({RIALTO_INFO.address}).
        </p>
      </section>

      <section>
        <h2>2. Commandes</h2>
        <p>
          Les commandes sont prises en livraison uniquement sur la zone
          desservie (vérifiable via le code postal sur la page d&apos;accueil).
          Le minimum de commande varie selon la zone (typiquement 25–30 CHF).
        </p>
        <p>
          Une fois passée, votre commande est transmise au restaurant qui
          vous envoie un SMS de confirmation. Vous pouvez suivre son avancement
          sur la page <a href="/confirmation">/confirmation</a>.
        </p>
      </section>

      <section>
        <h2>3. Prix et paiement</h2>
        <p>
          Les prix sont indiqués en francs suisses (CHF), TTC. Le paiement
          s&apos;effectue <strong>exclusivement à la livraison</strong>, auprès
          du livreur, en espèces, TWINT ou carte bancaire.
        </p>
        <p>
          Nous n&apos;acceptons aucun paiement en ligne. Aucune donnée
          bancaire n&apos;est collectée sur ce site.
        </p>
      </section>

      <section>
        <h2>4. Livraison</h2>
        <p>
          Le délai moyen de livraison est de <strong>30 minutes</strong> après
          acceptation de la commande, selon l&apos;affluence. Ce délai est
          indicatif et peut varier.
        </p>
        <p>
          Le livreur se présente à l&apos;adresse indiquée. Merci de vous
          rendre disponible et d&apos;indiquer précisément votre étage, code
          d&apos;entrée ou instructions utiles lors du checkout.
        </p>
      </section>

      <section>
        <h2>5. Annulation</h2>
        <p>
          Une commande peut être annulée sans frais tant qu&apos;elle
          n&apos;a pas été acceptée par le restaurant (statut &quot;En
          préparation&quot;). Passé ce stade, l&apos;annulation est à la
          discrétion du restaurant ; contactez-nous au{" "}
          <a href={`tel:${RIALTO_INFO.phoneTel}`}>{RIALTO_INFO.phoneDisplay}</a>.
        </p>
      </section>

      <section>
        <h2>6. Allergènes</h2>
        <p>
          Les informations allergènes affichées sur chaque plat sont données
          à titre indicatif. En cas d&apos;allergie grave, merci de nous
          contacter directement par téléphone pour confirmer la composition
          d&apos;un plat avant de commander.
        </p>
      </section>

      <section>
        <h2>7. Droit applicable</h2>
        <p>
          Les présentes conditions sont soumises au droit suisse. Tout litige
          relève de la compétence des tribunaux du canton de Vaud.
        </p>
      </section>
    </LegalPage>
  );
}
