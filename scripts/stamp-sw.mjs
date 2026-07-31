/**
 * Estampille CACHE_VERSION dans public/sw.js à chaque build Vercel
 * (prebuild). Sans elle, le contenu de sw.js ne change JAMAIS entre les
 * déploiements → le navigateur ne détecte aucune mise à jour, aucun
 * nouveau worker ne s'installe, et le toast « nouvelle version » ne peut
 * pas exister. C'était la cause racine du « front périmé » (commande
 * R-2026-039 : écran remisé, encaissement plein tarif).
 *
 * NE TOURNE QUE SUR VERCEL (process.env.VERCEL) : en local, le fichier
 * committé garde sa version placeholder — pas de diff parasite à chaque
 * build. Sur Vercel, la valeur committée est écrasée à chaque déploiement
 * par le SHA du commit (ou un timestamp en secours).
 */
import { readFileSync, writeFileSync } from "node:fs";

if (!process.env.VERCEL) {
  console.log("[stamp-sw] hors Vercel : sw.js laissé tel quel");
  process.exit(0);
}

const file = new URL("../public/sw.js", import.meta.url);
const src = readFileSync(file, "utf8");
const build =
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? String(Date.now());
const out = src.replace(
  /const CACHE_VERSION = "[^"]*";/,
  `const CACHE_VERSION = "rialto-${build}";`,
);
if (out === src) {
  console.error("[stamp-sw] motif CACHE_VERSION introuvable dans sw.js");
  process.exit(1);
}
writeFileSync(file, out);
console.log(`[stamp-sw] CACHE_VERSION = rialto-${build}`);
