/**
 * AUTOCOMPLÉTION D'ADRESSE — API GeoAdmin (Swisstopo).
 *
 * `GET https://api3.geo.admin.ch/rest/services/api/SearchServer`
 * Publique, gratuite, sans clé.
 *
 * ════════════════════════════════════════════════════════════════════
 * 🔴 LA RÈGLE QUI GOUVERNE TOUT CE FICHIER (Augustin, 22.08.2026)
 * ════════════════════════════════════════════════════════════════════
 * **L'AUTOCOMPLÉTION EST UN CONFORT DE SAISIE, JAMAIS UNE SOURCE DE
 * VÉRITÉ.** La qualification de zone reste dérivée du NPA validé CÔTÉ
 * SERVEUR (`/api/delivery-zones/check`), et le minimum de commande reste
 * celui que `POST /api/orders` relit en base.
 *
 * Sinon on rouvre le bug de la zone chimère : une adresse choisie dans une
 * liste porterait un NPA qu'on croirait vérifié, et le client se verrait
 * promettre des frais et un minimum que la commande ne tiendrait pas.
 * Ce module ne fait que REMPLIR UN CHAMP DE TEXTE.
 *
 * ════════════════════════════════════════════════════════════════════
 * LES CINQ PIÈGES DE CETTE API — les quatre d'Augustin, plus un
 * ════════════════════════════════════════════════════════════════════
 * Vérifiés en appelant l'API sur l'adresse du Rialto le 22.08 :
 *
 * ① **LE NPA N'A PAS DE CHAMP PROPRE.** Il faut le découper de `detail`.
 *    `detail` = "avenue de bethusy 11 1005 lausanne 5586 lausanne ch vd".
 *    ⚠️ Il y a DEUX blocs de quatre chiffres : `1005` (le NPA) et `5586`
 *    (le numéro OFS de la commune). C'est le PREMIER qui est le bon —
 *    prendre le dernier donnerait un NPA qui n'existe pas.
 *
 * ② **`label` CONTIENT DES BALISES `<b>` de surlignage.**
 *    "Avenue de Béthusy 11 <b>1005 Lausanne</b>". Les injecter telles
 *    quelles serait à la fois laid et dangereux.
 *
 * ③ **`x` / `y` SONT EN COORDONNÉES SUISSES ET INVERSÉS** par rapport à
 *    l'intuition : `x: 1152599` est la coordonnée NORD, `y: 2539055` la
 *    coordonnée EST (LV95). On utilise `lat` / `lon`, qui sont en WGS84 et
 *    dans le bon ordre. Ce module ne les expose même pas : personne n'en a
 *    besoin aujourd'hui, et un champ inutilisé finit par être mal utilisé.
 *
 * ④ **LE CLIENT DOIT POUVOIR PASSER OUTRE.** Une adresse que l'API ne
 *    connaît pas — un immeuble neuf, une graphie inhabituelle — ne doit
 *    jamais bloquer une commande. La saisie libre reste la voie normale ;
 *    la liste n'est qu'une aide.
 *
 * ⑤ **`num` N'EST PAS LE NUMÉRO AFFICHÉ** (trouvé en testant l'API, le
 *    22.08). Pour « Avenue de Béthusy 11.1 », `label` dit « 11.1 » et
 *    `num` vaut **111**. Le champ a perdu le point. On ne s'en sert donc
 *    PAS : le numéro vient du `label` nettoyé, qui est ce que le client
 *    lit et reconnaît.
 */

/** Ce qu'une suggestion expose au reste du code. Rien de plus. */
export interface SuggestionAdresse {
  /** Rue + numéro, sans le NPA ni la ville. Ce qui va dans le champ. */
  rue: string;
  /** NPA à quatre chiffres, extrait de `detail`. */
  npa: string;
  /** Ville, telle que l'API l'écrit. */
  ville: string;
  /** La ligne complète, pour l'affichage dans la liste. */
  libelle: string;
}

/** Forme brute d'un résultat GeoAdmin — on ne déclare que ce qu'on lit. */
interface ResultatBrut {
  attrs?: {
    label?: string;
    detail?: string;
    origin?: string;
  };
}

/**
 * Retire les balises de surlignage (piège ②) et normalise les espaces.
 *
 * ⚠️ On ne retire pas « les balises `<b>` » : on retire TOUTE balise. Si
 * l'API se met un jour à surligner avec `<em>` ou `<mark>`, une règle
 * écrite pour `<b>` seul laisserait passer le reste.
 */
export function nettoieLibelle(brut: string): string {
  return brut
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extrait le NPA de `detail` (piège ①).
 *
 * ⚠️ LE PREMIER bloc de quatre chiffres, jamais le dernier : `detail`
 * contient aussi le numéro OFS de la commune, qui a la même forme.
 * ⚠️ Bornes de mot des deux côtés : sans elles, « 11005 » rendrait
 * « 1100 ». Les NPA suisses vont de 1000 à 9999, d'où le premier chiffre
 * non nul.
 */
export function extraitNpa(detail: string): string | null {
  const m = detail.match(/(?:^|\s)([1-9]\d{3})(?=\s|$)/);
  return m ? m[1] : null;
}

/**
 * Coupe un libellé nettoyé en « rue » / « npa » / « ville ».
 *
 * Le libellé a la forme « Avenue de Béthusy 11 1005 Lausanne ». On coupe
 * AU NPA : ce qui précède est la rue, ce qui suit est la ville.
 * ⚠️ On se sert du NPA déjà extrait de `detail` plutôt que d'en chercher
 * un second dans le libellé : deux extractions, ce sont deux règles à
 * tenir d'accord.
 */
export function coupeLibelle(
  libelle: string,
  npa: string,
): { rue: string; ville: string } {
  const i = libelle.indexOf(npa);
  if (i < 0) return { rue: libelle, ville: "" };
  return {
    rue: libelle.slice(0, i).trim().replace(/,$/, ""),
    ville: libelle.slice(i + npa.length).trim(),
  };
}

/**
 * Transforme la réponse brute en suggestions exploitables.
 *
 * ⚠️ On ÉCARTE tout ce qui n'est pas une adresse (`origin: "address"`).
 * L'API rend aussi des communes, des lieux-dits et des parcelles : les
 * proposer donnerait des « adresses » sans rue ni numéro, sur lesquelles
 * on ne peut pas livrer.
 * ⚠️ Et tout ce dont on n'arrive pas à tirer un NPA est écarté aussi :
 * une suggestion sans NPA ne sert à rien ici, puisque c'est le NPA qui
 * qualifie la zone.
 */
export function litSuggestions(brut: unknown): SuggestionAdresse[] {
  const resultats = (brut as { results?: ResultatBrut[] } | null)?.results;
  if (!Array.isArray(resultats)) return [];

  const vues = new Set<string>();
  const out: SuggestionAdresse[] = [];

  for (const r of resultats) {
    const a = r?.attrs;
    if (!a || a.origin !== "address") continue;
    const detail = typeof a.detail === "string" ? a.detail : "";
    const npa = extraitNpa(detail);
    if (!npa) continue;
    const libelle = nettoieLibelle(typeof a.label === "string" ? a.label : "");
    if (!libelle) continue;
    if (vues.has(libelle)) continue;
    vues.add(libelle);

    const { rue, ville } = coupeLibelle(libelle, npa);
    if (!rue) continue;
    out.push({ rue, npa, ville, libelle });
  }
  return out;
}

/** L'URL d'appel. Isolée pour être testable et pour n'exister qu'une fois. */
export function urlRecherche(q: string, limite = 6): string {
  const p = new URLSearchParams({
    type: "locations",
    searchText: q,
    limit: String(limite),
    // `origins=address` demande à l'API de ne rendre que des adresses.
    // ⚠️ On filtre QUAND MÊME côté lecture (`litSuggestions`) : un
    // paramètre d'URL est une demande, pas une garantie. La garde vit dans
    // la fonction qui lit, pas dans celle qui demande.
    origins: "address",
  });
  return `https://api3.geo.admin.ch/rest/services/api/SearchServer?${p}`;
}
