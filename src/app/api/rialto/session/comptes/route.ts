import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { journaliseErreurBase } from "@/lib/apiErreurs";
import { PARAM_LIEN, verifieLienConnexion } from "@/lib/lienConnexion";

export const dynamic = "force-dynamic";

/**
 * GET /api/rialto/session/comptes?e=<adresse>&c=<jeton>
 *
 * Le jeton prouve la possession de l'ADRESSE. Cette route rend les comptes
 * que cette adresse porte, pour que le client CHOISISSE — décision
 * d'Augustin du 22.08 : « le lien doit proposer de choisir, jamais en
 * supposer un ».
 *
 * ⚠️ Ne pose AUCUN cookie. Choisir est un second geste, explicite
 * (`POST /api/rialto/session/ouvrir`). Un lien qui connecterait directement
 * connecterait au mauvais compte une fois sur deux dans un foyer.
 *
 * ⚠️ LA VÉRIFICATION DU JETON PRÉCÈDE TOUTE LECTURE EN BASE. Un jeton
 * invalide ne déclenche pas une seule requête — c'est ce que permet un
 * jeton signé sur l'adresse plutôt que sur un identifiant.
 */

/**
 * Masque un numéro : `+41791234589` → `07• ••• •• 89`.
 *
 * ⚠️ Deux derniers chiffres, pas plus. Assez pour que le membre du foyer
 * reconnaisse SON numéro, pas assez pour que quelqu'un qui a ouvert la
 * boîte mail par-dessus l'épaule reparte avec un numéro.
 * ⚠️ Si le format surprend, on ne devine pas : on masque tout.
 */
function masqueTelephone(brut: string | null): string {
  const chiffres = (brut ?? "").replace(/\D/g, "");
  if (chiffres.length < 4) return "numéro masqué";
  const fin = chiffres.slice(-2);
  return `0•• ••• •• ${fin}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = url.searchParams.get("e") ?? "";
  const jeton = url.searchParams.get(PARAM_LIEN);

  const verdict = verifieLienConnexion(email, jeton);
  if (!verdict.ok) {
    if (verdict.motif === "non_configure") {
      return NextResponse.json(
        { ok: false, error: "connexion_non_configuree" },
        { status: 500 },
      );
    }
    // `perime` et `invalide` sont distingués — voir `lienConnexion.ts` :
    // un jeton périmé s'obtient déjà avec une signature valide, il
    // n'apprend donc rien. En échange le client lit une phrase utile.
    return NextResponse.json(
      { ok: false, motif: verdict.motif },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  const sb = supabaseService();
  const { data, error } = await sb
    .from("customers")
    .select("id, first_name, last_name, phone")
    .eq("email", verdict.email)
    .order("created_at", { ascending: true })
    .limit(5);

  if (error) {
    journaliseErreurBase("session/comptes: lecture customers", error);
    return NextResponse.json(
      { ok: false, error: "Impossible de charger vos comptes. Réessayez." },
      { status: 503 },
    );
  }

  // Aucun compte alors que le jeton est valide : l'adresse a été retirée
  // entre l'envoi et le clic. Cas rare, mais il ne doit pas ressembler à
  // un lien cassé.
  if (!data || data.length === 0) {
    return NextResponse.json(
      { ok: false, motif: "aucun_compte" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      comptes: data.map((c) => ({
        id: c.id as string,
        prenom: String(c.first_name ?? "").trim() || "Client",
        // ⚠️ Pas le nom de famille : le prénom suffit à se reconnaître dans
        // son propre foyer, et il en dit moins à un tiers.
        telephone: masqueTelephone(c.phone as string | null),
      })),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
