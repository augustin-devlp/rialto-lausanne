import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { journaliseErreurBase } from "@/lib/apiErreurs";
import { verifieLienConnexion } from "@/lib/lienConnexion";
import {
  creeCookieSession,
  cookieDeconnexion,
  isSessionClientConfigured,
  clientConnecte,
} from "@/lib/sessionClient";

export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/session/ouvrir — { email, jeton, customer_id }
 * Pose le cookie de session pour le compte CHOISI.
 *
 * ════════════════════════════════════════════════════════════════════
 * 🔴 LA GARDE QUI COMPTE, ET ELLE VIT ICI
 * ════════════════════════════════════════════════════════════════════
 * Le jeton prouve l'ADRESSE. Il ne prouve PAS que le `customer_id` reçu
 * appartient à cette adresse. **Cette route re-vérifie le lien entre les
 * deux, en base, avant de signer quoi que ce soit.**
 *
 * Sans cette vérification, n'importe qui détenant un lien valide pour SA
 * PROPRE adresse pourrait ouvrir une session sur N'IMPORTE QUEL
 * `customer_id` en le postant à la main. Le lien de connexion deviendrait
 * une clé universelle. C'est le seul vrai piège de ce mécanisme, et il ne
 * se voit pas depuis l'écran de choix — qui, lui, ne montre que les bons
 * comptes.
 *
 * ⚠️ Une garde par EXCLUSION (« l'écran ne propose que les bons ») est
 * insuffisante : l'écran n'est pas la porte, cette route l'est.
 */

export async function POST(req: NextRequest) {
  if (!isSessionClientConfigured()) {
    return NextResponse.json(
      { ok: false, error: "session_non_configuree" },
      { status: 500 },
    );
  }

  const corps = (await req.json().catch(() => null)) as {
    email?: unknown;
    jeton?: unknown;
    customer_id?: unknown;
  } | null;

  const email = typeof corps?.email === "string" ? corps.email : "";
  const jeton = typeof corps?.jeton === "string" ? corps.jeton : null;
  const customerId =
    typeof corps?.customer_id === "string" ? corps.customer_id.trim() : "";

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "Choisissez un compte." },
      { status: 400 },
    );
  }

  const verdict = verifieLienConnexion(email, jeton);
  if (!verdict.ok) {
    return NextResponse.json(
      { ok: false, motif: verdict.motif },
      { status: 401, headers: { "cache-control": "no-store" } },
    );
  }

  // 🔴 LA RE-VÉRIFICATION. Le compte demandé doit VRAIMENT porter cette
  // adresse. On filtre sur les DEUX colonnes : l'identifiant seul ne
  // prouve rien.
  const sb = supabaseService();
  const { data: client, error } = await sb
    .from("customers")
    .select("id")
    .eq("id", customerId)
    .eq("email", verdict.email)
    .maybeSingle();

  if (error) {
    journaliseErreurBase("session/ouvrir: verification du compte", error);
    return NextResponse.json(
      { ok: false, error: "Connexion impossible pour le moment. Réessayez." },
      { status: 503 },
    );
  }
  if (!client) {
    // 404 et non 403 : ne pas confirmer qu'un identifiant existe.
    return NextResponse.json(
      { ok: false, motif: "compte_inconnu" },
      { status: 404, headers: { "cache-control": "no-store" } },
    );
  }

  const cookie = creeCookieSession(client.id as string);
  const res = NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}

/**
 * GET — « suis-je connecté ? ».
 * Le cookie est httpOnly, donc illisible en JS : le front doit demander.
 * ⚠️ Ne rend QUE le booléen et l'identifiant, jamais un profil : c'est un
 * test d'état, pas une route de données.
 */
export async function GET(req: NextRequest) {
  const customerId = clientConnecte(req);
  return NextResponse.json(
    { ok: Boolean(customerId), customer_id: customerId },
    { status: customerId ? 200 : 401, headers: { "cache-control": "no-store" } },
  );
}

/**
 * DELETE — déconnexion.
 * ⚠️ Le cookie n'étant pas révocable côté serveur (voir `sessionClient.ts`),
 * la déconnexion consiste à l'effacer du navigateur. Un cookie déjà copié
 * ailleurs resterait valide jusqu'à son échéance : c'est le prix d'une
 * session sans table, et il est écrit noir sur blanc dans le module.
 */
export async function DELETE() {
  const cookie = cookieDeconnexion();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
