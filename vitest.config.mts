import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Config minimale de vitest — ajoutée le 21.08.2026.
 *
 * Seule raison d'être : résoudre l'alias `@/` comme le fait Next.js
 * (tsconfig.json → "paths"). Sans elle, tout module testé qui importe en
 * `@/lib/...` échoue au chargement, et la seule échappatoire serait
 * d'écrire des imports relatifs dans le code de production pour faire
 * plaisir aux tests — c'est-à-dire de laisser l'outil de test dicter la
 * forme du code. On règle le problème du bon côté.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(fileURLToPath(new URL(".", import.meta.url)), "./src"),
    },
  },
});
