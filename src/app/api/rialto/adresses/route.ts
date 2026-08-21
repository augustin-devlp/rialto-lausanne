import { NextRequest, NextResponse } from "next/server";
import { litSuggestions, urlRecherche } from "@/lib/geoadmin";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/adresses?q=…
 * Proxy de l'autocomplétion GeoAdmin.
 *
 * ⚠️ POURQUOI UN PROXY plutôt qu'un appel direct depuis le navigateur :
 *  · le nettoyage et l'extraction du NPA vivent à UN seul endroit
 *    (`src/lib/geoadmin.ts`), testé — pas recopiés dans un composant ;
 *  · on maîtrise le cache et le délai d'attente ;
 *  · aucune dépendance à la politique CORS d'un service tiers, qui peut
 *    changer sans nous prévenir.
 *
 * 🔴 CE QUE CETTE ROUTE NE FAIT PAS, ET NE DOIT JAMAIS FAIRE : qualifier
 * une zone. Elle rend du TEXTE pour remplir un champ. La zone se qualifie
 * par `/api/delivery-zones/check` sur le NPA, côté serveur, et le minimum
 * de commande est relu en base par `POST /api/orders`. Faire confiance au
 * NPA d'une suggestion rouvrirait le bug de la zone chimère.
 *
 * ⚠️ Aucune donnée client n'est stockée. La requête part chez Swisstopo
 * (service fédéral suisse) telle quelle : c'est une recherche d'adresse
 * publique, pas une donnée de commande.
 */

const DELAI_MS = 4000;

export async function GET(req: NextRequest) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();

  // Sous trois caractères, l'API rend surtout du bruit et on l'appelle
  // pour rien à chaque frappe.
  if (q.length < 3) {
    return NextResponse.json(
      { ok: true, suggestions: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }

  // ⚠️ Délai d'attente OBLIGATOIRE : sans lui, une lenteur de Swisstopo
  // devient une lenteur du checkout de Rialto. Le champ doit rester
  // utilisable même si l'autocomplétion ne répond pas.
  const minuteur = AbortSignal.timeout(DELAI_MS);

  try {
    const resp = await fetch(urlRecherche(q), {
      signal: minuteur,
      headers: { accept: "application/json" },
      // Cache CDN court : deux clients qui tapent la même rue le même soir
      // ne doivent pas faire deux appels.
      next: { revalidate: 300 },
    });
    if (!resp.ok) {
      // ⚠️ On rend une LISTE VIDE, pas une erreur. Le client doit pouvoir
      // continuer à taper son adresse à la main — c'est la règle ④ :
      // l'autocomplétion ne bloque jamais une commande.
      console.warn("[adresses] GeoAdmin a répondu", resp.status);
      return NextResponse.json(
        { ok: true, suggestions: [] },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const brut = await resp.json();
    return NextResponse.json(
      { ok: true, suggestions: litSuggestions(brut) },
      { headers: { "cache-control": "private, max-age=60" } },
    );
  } catch (err) {
    // Idem : panne, coupure ou dépassement de délai → liste vide, jamais
    // un écran d'erreur.
    console.warn("[adresses] autocomplétion indisponible", err);
    return NextResponse.json(
      { ok: true, suggestions: [] },
      { headers: { "cache-control": "no-store" } },
    );
  }
}
