import { NextRequest, NextResponse } from "next/server";
import { supabaseService } from "@/lib/supabase";
import { journaliseErreurBase } from "@/lib/apiErreurs";
import {
  estConfigureLienConnexion,
  normaliseEmail,
  signeLienConnexion,
  construitUrlConnexion,
  DUREE_LIEN_MS,
} from "@/lib/lienConnexion";
import { sendEmail } from "@/lib/brevo";
import { construitEmailConnexion } from "@/lib/loginEmail";

import { isSessionClientConfigured } from "@/lib/sessionClient";
export const dynamic = "force-dynamic";

/**
 * POST /api/rialto/session/demande — { email }
 *
 * Envoie un lien de connexion à l'adresse, SI elle correspond à au moins
 * un client.
 *
 * ════════════════════════════════════════════════════════════════════
 * 🔴 LA GARDE QUI GOUVERNE TOUTE CETTE ROUTE (Augustin, 22.08.2026)
 * ════════════════════════════════════════════════════════════════════
 * **CETTE ROUTE NE DIT JAMAIS SI L'ADRESSE EXISTE OU NON.** Même corps,
 * même statut, dans tous les cas.
 *
 * Sinon elle devient un TEST D'EXISTENCE DE COMPTE, et on rouvre
 * exactement ce qu'on ferme : au lieu de deviner un numéro de téléphone,
 * on essaie des adresses e-mail jusqu'à ce que la réponse change. La
 * fuite est la même, seule la clé a changé.
 *
 * ⚠️ CE QUE JE NE PEUX PAS PROMETTRE, ET IL FAUT LE DIRE : l'égalité des
 * réponses ne suffit pas à elle seule. Le cas « l'adresse existe »
 * déclenche un appel à Brevo, donc prend plus de temps. L'envoi est
 * FIRE-AND-FORGET — la réponse part avant lui — ce qui aplatit l'essentiel
 * de l'écart, mais je ne prétends pas que le temps de réponse soit
 * rigoureusement identique. Ce qui ferme vraiment la porte, c'est la
 * LIMITE PAR ADRESSE ci-dessous : sonder mille adresses demande mille
 * fenêtres d'une heure.
 *
 * ════════════════════════════════════════════════════════════════════
 * DEUX LIMITES, PAS UNE — et elles ne protègent pas la même chose
 * ════════════════════════════════════════════════════════════════════
 * · PAR IP : contre le sondage en rafale.
 * · PAR ADRESSE : contre le bombardement de la boîte de quelqu'un. Sans
 *   elle, n'importe qui peut faire envoyer cent e-mails à une adresse
 *   connue — et c'est nous qui les envoyons, donc c'est notre réputation
 *   d'expéditeur qui trinque.
 *
 * ⚠️ HONNÊTETÉ SUR CES LIMITES : les deux `Map` vivent dans UNE instance de
 * lambda. Sur du serverless, la limite réelle est « N × nombre d'instances
 * chaudes ». Elles RALENTISSENT, elles ne FERMENT pas. Les fermer pour de
 * bon demanderait un stockage partagé — donc une table, donc une migration.
 */

const FENETRE_IP_MS = 10 * 60 * 1000;
const MAX_PAR_IP = 5;
const FENETRE_EMAIL_MS = 60 * 60 * 1000;
const MAX_PAR_EMAIL = 3;

const parIp = new Map<string, { n: number; debut: number }>();
const parEmail = new Map<string, { n: number; debut: number }>();

function sousLaLimite(
  cle: string,
  table: Map<string, { n: number; debut: number }>,
  fenetre: number,
  max: number,
): boolean {
  const maintenant = Date.now();
  const e = table.get(cle);
  if (!e || maintenant - e.debut > fenetre) {
    table.set(cle, { n: 1, debut: maintenant });
    return true;
  }
  if (e.n >= max) return false;
  e.n += 1;
  return true;
}

function ipDe(req: NextRequest): string {
  const f = req.headers.get("x-forwarded-for");
  return (f ? f.split(",")[0] : "").trim() || "inconnue";
}

/**
 * LA réponse. Une seule, construite une fois, utilisée partout.
 *
 * ⚠️ Elle est délibérément écrite ici et non à chaque `return` : c'est la
 * seule façon de garantir qu'aucune branche ne diverge par inadvertance.
 * Une garde par « je ferai attention à chaque retour » n'est pas une garde.
 * Texte en mots courants (règle R4).
 */
function memeReponsePourTous() {
  return NextResponse.json(
    {
      ok: true,
      message:
        "Si un compte existe avec cette adresse, le lien vient de partir. Regardez votre boîte mail.",
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

export async function POST(req: NextRequest) {
  // ⚠️ LES DEUX SECRETS, PAS UN. Cette route ne testait que celui du LIEN.
  // Sans `CLIENT_SESSION_SECRET`, l'e-mail partait, l'écran de choix
  // s'affichait, et c'est `session/ouvrir` qui rendait 500 — à la DERNIÈRE
  // étape. Le client redemandait un lien, recommençait, et se faisait
  // bloquer par la limite au bout de trois essais.
  // La garde de configuration vit à l'ENTRÉE du parcours, pas à sa sortie.
  if (!estConfigureLienConnexion() || !isSessionClientConfigured()) {
    // Panne de config : on ne fait PAS semblant d'avoir envoyé. Un client
    // qui attend un e-mail qui n'arrivera jamais est pire qu'une erreur.
    return NextResponse.json(
      { ok: false, error: "connexion_non_configuree" },
      { status: 500 },
    );
  }

  const corps = (await req.json().catch(() => null)) as
    | { email?: unknown }
    | null;
  const brut =
    typeof corps?.email === "string" ? corps.email.trim() : "";
  const email = normaliseEmail(brut);

  // Format manifestement invalide : on ne consomme pas de quota et on ne
  // prétend pas avoir envoyé — il n'y a rien à protéger, aucune adresse
  // réelle n'a cette forme.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Cette adresse n'est pas complète." },
      { status: 400 },
    );
  }

  if (!sousLaLimite(ipDe(req), parIp, FENETRE_IP_MS, MAX_PAR_IP)) {
    // ⚠️ MÊME RÉPONSE QUE LE SUCCÈS, VOLONTAIREMENT. Un 429 distinct
    // apprendrait à un sondeur qu'il a touché la limite, donc qu'il sonde
    // au bon endroit. Il patiente sans le savoir.
    return memeReponsePourTous();
  }
  if (!sousLaLimite(email, parEmail, FENETRE_EMAIL_MS, MAX_PAR_EMAIL)) {
    return memeReponsePourTous();
  }

  const sb = supabaseService();
  const { data: clients, error } = await sb
    .from("customers")
    .select("id")
    .eq("email", email)
    .limit(5);

  if (error) {
    journaliseErreurBase("session/demande: lecture customers", error);
    // Même réponse : une panne ne doit pas non plus révéler quoi que ce
    // soit. Le client ne recevra rien et redemandera — c'est le pire cas,
    // et il est sans danger.
    return memeReponsePourTous();
  }

  if (clients && clients.length > 0) {
    const jeton = signeLienConnexion(email);
    if (jeton) {
      const url = construitUrlConnexion(email, jeton);
      const minutes = Math.round(DUREE_LIEN_MS / 60000);
      // Fire-and-forget : la réponse part AVANT l'appel à Brevo. C'est ce
      // qui aplatit l'essentiel de l'écart de temps entre « existe » et
      // « n'existe pas » (voir l'en-tête).
      void (async () => {
        try {
          const { subject, html, text } = construitEmailConnexion({
            url,
            minutes,
            plusieursComptes: clients.length > 1,
          });
          await sendEmail({ to: email, subject, html, text });
        } catch (err) {
          console.error("[session/demande] envoi du lien en échec", err);
        }
      })();
    }
  }

  return memeReponsePourTous();
}
