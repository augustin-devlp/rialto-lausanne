/**
 * Libellés + styles des statuts de commande, VUE PATRON (interne).
 * Note : le statut DB `ready` s'affiche "Prête" côté patron mais
 * "En livraison" côté client (/confirmation) — choix éditorial existant :
 * dès que la commande est prête, le livreur part.
 */

export const STATUS_LABELS: Record<string, string> = {
  new: "Nouvelle",
  accepted: "Acceptée",
  preparing: "En préparation",
  ready: "Prête",
  completed: "Livrée",
  cancelled: "Annulée",
};

export function statusChipClasses(status: string): string {
  switch (status) {
    case "new":
      return "bg-rialto text-white";
    case "accepted":
      return "bg-blue-50 text-blue-700";
    case "preparing":
      return "bg-amber-50 text-amber-800";
    case "ready":
      return "bg-emerald-50 text-emerald-700";
    case "completed":
      return "bg-ink/5 text-ink/70";
    case "cancelled":
      return "bg-ink/10 text-ink/50";
    default:
      return "bg-ink/5 text-ink/70";
  }
}

/** Prochaine action logique par statut (bouton principal de la fiche). */
export const NEXT_ACTION: Record<
  string,
  { status: string; label: string } | null
> = {
  new: { status: "accepted", label: "Accepter la commande" },
  accepted: { status: "preparing", label: "Passer en préparation" },
  preparing: { status: "ready", label: "Marquer prête" },
  ready: { status: "completed", label: "Marquer livrée" },
  completed: null,
  cancelled: null,
};
