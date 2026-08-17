/**
 * Compteur module-level des opérations critiques EN VOL (POST de création
 * de commande, en tête). Consommé par PwaRegister : la mise à jour SW
 * silencieuse ne recharge JAMAIS pendant qu'une telle opération est en
 * cours — un reload trancherait le fetch côté client alors que le
 * serveur, lui, va au bout : commande créée + panier intact au
 * rechargement = re-soumission = commande en double (relecture 17.08).
 *
 * Toujours appeler termine() dans un `finally` : un compteur qui fuit
 * bloquerait les mises à jour pour toute la session.
 */

let enVol = 0;

export function debuteOperationCritique(): void {
  enVol += 1;
}

export function termineOperationCritique(): void {
  enVol = Math.max(0, enVol - 1);
}

export function operationCritiqueEnCours(): boolean {
  return enVol > 0;
}
