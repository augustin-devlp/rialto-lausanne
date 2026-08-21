/**
 * ERREURS D'API — CE QUI SORT, ET CE QUI RESTE DANS LES LOGS.
 *
 * 🔴 RÈGLE (Augustin, 22.08.2026) : AUCUNE ROUTE NE RENVOIE JAMAIS UN
 * MESSAGE D'ERREUR DE LA BASE AU CLIENT. JAMAIS.
 *
 * ────────────────────────────────────────────────────────────────────
 * CE QUI A COÛTÉ LA RÈGLE
 * ────────────────────────────────────────────────────────────────────
 * `POST /api/rialto/loyalty/signup` renvoyait `custErr.message` tel quel.
 * Sur un foyer partageant une adresse e-mail, ça donnait, affiché sur la
 * page d'inscription au Rialto Club :
 *
 *     duplicate key value violates unique constraint
 *     "customers_email_unique"
 *
 * Deux fautes en une : le client est bloqué, ET il lit le nom d'une
 * contrainte de la base. `JoinClient` fait `setError(body.error)` — le
 * message part droit à l'écran, sans filtre.
 *
 * Le balayage du 22.08 a trouvé **13 sites dans 7 fichiers**. Le plus
 * visible après signup : `LotteryEntry` fait aussi `setError(b.error)`.
 *
 * ────────────────────────────────────────────────────────────────────
 * POURQUOI C'EST GRAVE MÊME QUAND LE CLIENT NE COMPREND PAS
 * ────────────────────────────────────────────────────────────────────
 * Un message Postgres nomme des tables, des colonnes et des contraintes.
 * C'est la carte du bâtiment, donnée à qui la demande. Et pour le client
 * qui ne la lit pas, c'est pire encore : un charabia anglais à la place
 * d'une phrase qui lui dirait quoi faire.
 *
 * ⚠️ CE QUI RESTE AUTORISÉ : renvoyer un message que NOUS avons écrit
 * (`deriveOrderPricing` rend « Panier trop volumineux… », `spinAvailability`
 * rend « Revenez demain »). La règle vise ce qui vient de la BASE ou d'une
 * exception non maîtrisée.
 */

/**
 * Journalise une erreur de base côté SERVEUR, en une forme greppable.
 *
 * ⚠️ Le retour est `void` — délibérément. Une fonction qui renverrait un
 * message « sûr » inviterait à le renvoyer au client, et la question
 * « lequel ? » se reposerait à chaque appel. Ici le contrat est net : on
 * journalise, et l'appelant écrit LUI-MÊME une phrase pour son écran, dans
 * ses mots, adaptée à ce que le client peut faire.
 *
 * @param contexte  d'où ça vient, en clair — « loyalty/signup: insert customer »
 */
export function journaliseErreurBase(contexte: string, err: unknown): void {
  const e = err as
    | { code?: string; message?: string; details?: string; hint?: string }
    | null
    | undefined;
  console.error("[erreur-base] " + contexte, {
    code: e?.code ?? null,
    message: e?.message ?? String(err),
    details: e?.details ?? null,
    hint: e?.hint ?? null,
  });
}

/**
 * Violation d'unicité Postgres.
 *
 * Sert aux reprises : sur `customers`, une collision d'e-mail doit faire
 * retomber sur une création SANS e-mail plutôt que perdre le client
 * (`api/orders/route.ts` et `loyalty/signup` le font tous les deux).
 * ⚠️ Reste utile même après le retrait de `customers_email_unique`
 * (navette CU1) : la collision de TÉLÉPHONE, elle, ne disparaît pas.
 */
export const CODE_UNICITE = "23505";

/** True si l'erreur est une violation d'unicité Postgres. */
export function estViolationUnicite(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === CODE_UNICITE;
}
