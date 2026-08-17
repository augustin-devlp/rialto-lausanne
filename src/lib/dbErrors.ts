/**
 * Erreurs PostgREST récurrentes — pattern « colonne en navette »
 * (18.08.2026) : une colonne rédigée en navette DDL n'existe pas encore
 * en base ; le code la référence déjà et doit dégrader proprement.
 * 42703 = undefined_column (SQL) ; PGRST204 = colonne absente du cache
 * de schéma PostgREST. Les deux se produisent selon le chemin — tester
 * l'un sans l'autre a déjà produit des dégradations divergentes
 * (~8 occurrences retapées à la main dans le repo, relecture 18.08 —
 * à migrer ici au fil de l'eau).
 */
export function estColonneAbsente(
  err: { code?: string } | null | undefined,
): boolean {
  return err?.code === "42703" || err?.code === "PGRST204";
}
