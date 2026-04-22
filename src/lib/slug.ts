/**
 * Slugification minimale pour construire des URLs produit stables.
 *
 * Règles :
 * - Remplace les accents par leur version sans accent (é → e, à → a)
 * - Minuscules, mots séparés par `-`
 * - Caractères non-alphanum retirés
 * - Espaces, ponctuation → `-`
 *
 * En cas de collision (2 plats avec exactement le même nom), on suffixe
 * le slug avec les 8 premiers chars de l'ID menu_item pour désambiguïser.
 *
 * Exemples :
 *   "Pizza à la turca"          → pizza-a-la-turca
 *   "Tagliatelles aux moules"   → tagliatelles-aux-moules
 *   "Pizza 4 Fromages"          → pizza-4-fromages
 */

const ACCENTS_MAP: Record<string, string> = {
  à: "a", á: "a", â: "a", ä: "a", ã: "a", å: "a",
  ç: "c",
  è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i",
  ñ: "n",
  ò: "o", ó: "o", ô: "o", ö: "o", õ: "o",
  ù: "u", ú: "u", û: "u", ü: "u",
  ý: "y", ÿ: "y",
  œ: "oe", æ: "ae",
  ß: "ss",
};

export function slugify(input: string): string {
  if (!input) return "";
  const lower = input.toLowerCase().trim();
  // Map accents
  const noAccent = Array.from(lower)
    .map((ch) => ACCENTS_MAP[ch] ?? ch)
    .join("");
  // Non-alphanum → dash
  const slug = noAccent
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60); // cap length
  return slug || "item";
}

/** Slug stable pour un menu_item avec fallback sur l'ID. */
export function menuItemSlug(item: { id: string; name: string }): string {
  const base = slugify(item.name);
  // Concatène les 8 premiers chars de l'ID pour garantir l'unicité.
  const idSuffix = item.id.replace(/-/g, "").slice(0, 8);
  return `${base}-${idSuffix}`;
}

/** Extrait l'ID de 8 chars d'un slug produit. */
export function idSuffixFromSlug(slug: string): string | null {
  const m = slug.match(/-([a-f0-9]{8})$/);
  return m ? m[1] : null;
}
