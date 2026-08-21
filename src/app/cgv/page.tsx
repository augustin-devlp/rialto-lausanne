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
          {/* ⚠️ DISAIT « typiquement 25–30 CHF ». Faux dans les deux sens :
              aucune zone n'est à 30, et la grille monte à 55. Valeurs
              relevées en base le 22.08 (`delivery_zones.min_order_amount`) :
              25 sur 15 NPA, 35 sur 11, 45 sur 19, 55 sur 19.
              🔴 CES CHIFFRES SONT CONTRACTUELS. Toute navette qui touche la
              grille des zones doit repasser ici. */}{" "}
          Le minimum de commande dépend de votre zone : de 25 à 55 CHF. Le
          montant exact s&apos;affiche dès que vous entrez votre code postal.
        </p>
        {/* ⚠️ AJOUTÉ LE 22.08 : l'email est devenu OBLIGATOIRE pour
            commander le 21.08 (`src/app/api/orders/route.ts`, const
            `emailRecu`). C'est une CONDITION DE COMMANDE, donc contractuel —
            les CGV ne le mentionnaient nulle part. */}
        <p>
          Une adresse email valide est nécessaire pour passer commande : elle
          sert à vous envoyer le reçu et le lien de suivi de votre commande.
        </p>
        <p>
          {/* ⚠️ DISAIT « vous envoie un SMS de confirmation ». Plus vrai
              depuis la séparation des canaux du 21.07.2026 : aucun SMS n'est
              envoyé à la création d'une commande (vérifié — `sendSms` n'est
              pas appelé dans `src/app/api/orders/route.ts`). Le client reçoit
              un email. Corrigé le 22.08. */}
          Une fois passée, votre commande est transmise au restaurant et vous
          recevez un email de confirmation. Vous pouvez suivre son avancement
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
