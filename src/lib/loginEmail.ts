/**
 * L'e-mail qui porte le lien de connexion.
 *
 * ⚠️ REGISTRE (règle R4) : la clientèle de Rialto n'est pas un public à
 * français soutenu. Mots courants, phrases courtes, aucune formule
 * abstraite. Un e-mail de connexion doit se comprendre en trois secondes,
 * y compris par quelqu'un qui n'en a jamais reçu.
 *
 * ⚠️ CE QU'IL NE DIT PAS, ET C'EST VOULU : ni le prénom, ni le numéro, ni
 * le nombre exact de comptes. L'e-mail peut être lu par quelqu'un d'autre
 * — c'est précisément le risque qu'on borne à quinze minutes. Il ne doit
 * donc rien apprendre à qui n'est pas le destinataire.
 */

const TERRACOTTA = "#C73E1D";
const ENCRE = "#1A1A1A";
const MUET = "#6B6B6B";
const CREME = "#F9F1E4";

export function construitEmailConnexion(params: {
  url: string;
  minutes: number;
  /** Vrai si l'adresse porte plusieurs comptes — change UNE phrase. */
  plusieursComptes: boolean;
}): { subject: string; html: string; text: string } {
  const { url, minutes, plusieursComptes } = params;

  const subject = "Votre lien de connexion Rialto";

  // ⚠️ Une seule phrase change selon le nombre de comptes, et elle PRÉPARE
  // l'écran de choix au lieu de le laisser surprendre le client.
  const phraseComptes = plusieursComptes
    ? "Plusieurs comptes utilisent cette adresse. Vous choisirez lequel ouvrir juste après."
    : "";

  const text = [
    "Bonjour,",
    "",
    "Voici votre lien pour vous connecter à votre compte Rialto :",
    url,
    "",
    `Ce lien marche pendant ${minutes} minutes. Après, il faut en redemander un — c'est normal et ça prend dix secondes.`,
    phraseComptes,
    "",
    "Vous n'avez rien demandé ? Ne cliquez pas. Personne ne peut ouvrir votre compte sans ce lien.",
    "",
    "Rialto — Av. de Béthusy, Lausanne",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:${CREME};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:${ENCRE}">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;padding:28px">
    <div style="font-size:22px;font-weight:700;color:${TERRACOTTA};margin-bottom:18px">Rialto</div>

    <p style="font-size:16px;line-height:1.5;margin:0 0 18px">Bonjour,</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 22px">
      Voici votre lien pour vous connecter à votre compte&nbsp;Rialto.
    </p>

    <a href="${url}"
       style="display:block;text-align:center;background:${TERRACOTTA};color:#fff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 20px;border-radius:12px;margin:0 0 22px">
      Ouvrir mon compte
    </a>

    <p style="font-size:14px;line-height:1.5;color:${MUET};margin:0 0 10px">
      Ce lien marche pendant <strong>${minutes} minutes</strong>. Après, il faut
      en redemander un — c'est normal et ça prend dix secondes.
    </p>
    ${
      phraseComptes
        ? `<p style="font-size:14px;line-height:1.5;color:${MUET};margin:0 0 10px">${phraseComptes}</p>`
        : ""
    }
    <p style="font-size:14px;line-height:1.5;color:${MUET};margin:0 0 18px">
      Vous n'avez rien demandé ? Ne cliquez pas. Personne ne peut ouvrir
      votre compte sans ce lien.
    </p>

    <!-- ⚠️ Le lien en clair : certains clients de messagerie n'affichent
         pas les boutons, et un lien qu'on ne peut pas copier est un lien
         mort. -->
    <p style="font-size:12px;line-height:1.5;color:${MUET};margin:0;word-break:break-all">
      Si le bouton ne marche pas, copiez cette adresse&nbsp;:<br>${url}
    </p>

    <hr style="border:none;border-top:1px solid #E8E3D8;margin:22px 0">
    <p style="font-size:12px;color:${MUET};margin:0">Rialto — Av. de Béthusy, Lausanne</p>
  </div>
</body></html>`;

  return { subject, html, text };
}
