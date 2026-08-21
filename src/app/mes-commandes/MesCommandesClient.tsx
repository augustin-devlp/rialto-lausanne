"use client";

import Link from "next/link";
import LienAccueil from "@/components/layout/LienAccueil";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SiteFooter from "@/components/home/SiteFooter";
import { formatCHF } from "@/lib/format";
import { readCustomerSession } from "@/lib/customerSession";
import { addLinesToCart } from "@/lib/clientStore";
import type { CartItem } from "@/lib/types";

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
};

/** Statuts pour lesquels un SUIVI aurait du sens.
 *  ⚠️ AUCUN CODE NE LA LIT AUJOURD'HUI, et c'est volontaire : le lien
 *  « Suivre ma commande » a été retiré le 21.08 (voir le commentaire au
 *  point d'affichage, plus bas — le jeton n'a plus de source). La constante
 *  est CONSERVÉE pour son retour avec la session client signée.
 *  Une règle au présent sans code derrière serait un commentaire menteur :
 *  celui-ci dit explicitement qu'il décrit un état à venir. */
const STATUTS_EN_COURS = ["new", "accepted", "preparing", "ready"];

type LigneDetail = {
  nom: string;
  quantite: number;
  options: string[];
  notes: string | null;
  montant: number;
};
type Detail = {
  lignes: LigneDetail[];
  montants: {
    sous_total: number;
    livraison: number;
    remise: number;
    total: number;
  };
};
/** État du dépliement d'UNE commande : on ne charge qu'à l'ouverture, et
 *  on garde en mémoire pour ne pas refetcher au repli/dépli suivant. */
type EtatDetail =
  | { statut: "chargement" }
  | { statut: "ok"; detail: Detail }
  | { statut: "erreur" };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "En attente", color: "bg-gray-100 text-gray-700" },
  accepted: { label: "Acceptée", color: "bg-blue-50 text-blue-700" },
  preparing: { label: "En préparation", color: "bg-amber-50 text-amber-800" },
  ready: { label: "En livraison", color: "bg-orange-50 text-orange-800" },
  // ⚠️ « Terminée », PAS « Livrée » (Augustin 21.08). Le statut
  // `completed` ne prouve pas une livraison : il sera posé
  // AUTOMATIQUEMENT par la clôture du service (CL1) sur toute commande
  // acceptée de la veille, sans que personne n'ait constaté la remise.
  // Afficher « Livrée » serait affirmer une certitude qu'on n'a pas.
  completed: { label: "Terminée", color: "bg-emerald-50 text-emerald-700" },
  cancelled: { label: "Annulée", color: "bg-rialto/10 text-rialto" },
};

export default function MesCommandesClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [authState, setAuthState] = useState<"unknown" | "logged_in" | "guest">(
    "unknown",
  );
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  // Dépliement sur place (item 4, 21.08) : la ligne s'ouvre SANS quitter
  // la liste. Chargement paresseux, mémorisé par numéro de commande.
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, EtatDetail>>({});

  async function basculeDetail(orderNumber: string) {
    if (ouverte === orderNumber) {
      setOuverte(null);
      return;
    }
    setOuverte(orderNumber);
    // Déjà chargé (ou en cours) : on ne refetch pas.
    if (details[orderNumber]?.statut === "ok") return;
    const session = readCustomerSession();
    if (!session?.phone) {
      setDetails((d) => ({ ...d, [orderNumber]: { statut: "erreur" } }));
      return;
    }
    setDetails((d) => ({ ...d, [orderNumber]: { statut: "chargement" } }));
    try {
      const url = new URL(
        `/api/rialto/orders/${encodeURIComponent(orderNumber)}/detail`,
        window.location.origin,
      );
      url.searchParams.set("phone", session.phone);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as Detail;
      setDetails((d) => ({
        ...d,
        [orderNumber]: { statut: "ok", detail: body },
      }));
    } catch {
      setDetails((d) => ({ ...d, [orderNumber]: { statut: "erreur" } }));
    }
  }

  async function handleReorder(orderNumber: string) {
    setReorderingId(orderNumber);
    try {
      // La route reorder vérifie le PROPRIÉTAIRE par téléphone, comme sa
      // route sœur `detail` — même session, même preuve. Elle renvoyait le
      // panier complet, notes libres comprises, à qui devinait un numéro.
      const session = readCustomerSession();
      if (!session?.phone) {
        alert("Reconnectez-vous pour recommander.");
        return;
      }
      const urlReorder = new URL(
        `/api/rialto/orders/${encodeURIComponent(orderNumber)}/reorder`,
        window.location.origin,
      );
      urlReorder.searchParams.set("phone", session.phone);
      const res = await fetch(urlReorder.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        cart_items: CartItem[];
        unavailable_count: number;
      };
      if (!body.cart_items || body.cart_items.length === 0) {
        alert(
          body.unavailable_count > 0
            ? `Désolé, aucun des plats de cette commande n'est plus disponible aujourd'hui.`
            : "Impossible de recharger cette commande.",
        );
        return;
      }
      // Helper unique Lot D : merge par key + écriture + un add_to_cart
      // tracké PAR LIGNE re-commandée (quantité = quantité ajoutée).
      addLinesToCart(body.cart_items);
      const note =
        body.unavailable_count > 0
          ? ` (${body.unavailable_count} plat${body.unavailable_count > 1 ? "s" : ""} indisponible${body.unavailable_count > 1 ? "s" : ""} ignoré${body.unavailable_count > 1 ? "s" : ""})`
          : "";
      // Petite notification native avant redirect
      console.log(`[reorder] ${body.cart_items.length} items ajoutés${note}`);
      router.push("/checkout");
    } catch (err) {
      console.error("[reorder] failed", err);
      alert("Erreur lors de la re-commande. Réessayez dans un instant.");
    } finally {
      setReorderingId(null);
    }
  }

  useEffect(() => {
    const session = readCustomerSession();
    if (!session) {
      setAuthState("guest");
      setLoading(false);
      return;
    }
    setAuthState("logged_in");

    (async () => {
      try {
        const url = new URL("/api/rialto/loyalty/lookup", window.location.origin);
        url.searchParams.set("phone", session.phone);
        const res = await fetch(url.toString());
        if (!res.ok) {
          setOrders([]);
          return;
        }
        const body = (await res.json()) as { orders?: OrderRow[] };
        setOrders(body.orders ?? []);
      } catch {
        setOrders([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <>
      <main className="min-h-screen bg-white pb-12 pt-8">
        <div className="container-hero">
          <LienAccueil className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink" avecFleche />

          <header className="mb-5 max-w-prose-wide">
            <span className="eyebrow">Rialto Club</span>
            <h1 className="mt-2 font-display text-2xl sm:text-3xl font-bold">
              Mes commandes
            </h1>
            <p className="mt-1 text-sm text-mute">
              Historique de vos commandes Rialto.
            </p>
          </header>

          {authState === "guest" && (
            <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-5 text-center shadow-card">
              <div className="mx-auto mb-4 text-4xl">🔑</div>
              <h2 className="font-display text-xl font-bold">
                Pas de compte Rialto Club
              </h2>
              <p className="mt-2 text-sm text-mute">
                Pour voir votre historique, créez votre carte fidélité
                (gratuite, 30 sec).
              </p>
              <Link
                href="/rialto-club/join"
                className="btn-primary mt-5"
              >
                Rejoindre Rialto Club
              </Link>
            </div>
          )}

          {authState === "logged_in" && loading && (
            <div className="mx-auto max-w-2xl space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-2xl border border-border bg-white"
                />
              ))}
            </div>
          )}

          {authState === "logged_in" && !loading && orders.length === 0 && (
            <div className="mx-auto max-w-md rounded-3xl border border-border bg-white p-5 text-center">
              <div className="mx-auto mb-4 text-4xl">🍕</div>
              <h2 className="font-display text-xl font-bold">
                Pas encore de commande
              </h2>
              <p className="mt-2 text-sm text-mute">
                C&apos;est le moment de tester la pizza Bethusy.
              </p>
              <Link href="/menu" className="btn-primary mt-5">
                Voir le menu
              </Link>
            </div>
          )}

          {authState === "logged_in" && !loading && orders.length > 0 && (
            <ul className="mx-auto max-w-2xl space-y-3">
              {orders.map((order) => {
                const status =
                  STATUS_LABELS[order.status] ?? STATUS_LABELS.new;
                const date = new Date(order.created_at).toLocaleDateString(
                  "fr-CH",
                  {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  },
                );
                const isReordering = reorderingId === order.order_number;
                const estOuverte = ouverte === order.order_number;
                const etat = details[order.order_number];
                return (
                  <li
                    key={order.id}
                    className="rounded-2xl border border-border bg-white shadow-card transition hover:shadow-pop"
                  >
                    <div className="flex items-center gap-4 p-4">
                      <button
                        type="button"
                        onClick={() => void basculeDetail(order.order_number)}
                        aria-expanded={estOuverte}
                        aria-controls={`detail-${order.order_number}`}
                        className="flex flex-1 items-center gap-3 text-left transition hover:opacity-90"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold">
                              {order.order_number}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.color}`}
                            >
                              {status.label}
                            </span>
                          </div>
                          <div className="mt-0.5 text-xs text-mute">
                            {date}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-right">
                          <div className="tabular font-display text-base font-bold">
                            {formatCHF(Number(order.total_amount))}
                          </div>
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            className={`shrink-0 text-mute transition-transform ${
                              estOuverte ? "rotate-180" : ""
                            }`}
                            aria-hidden
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </button>
                    </div>

                    {/* DÉTAIL DÉPLIÉ SUR PLACE — le client voit ce qu'il a
                        mangé sans quitter sa liste (item 4, 21.08). */}
                    {estOuverte && (
                      <div
                        id={`detail-${order.order_number}`}
                        className="border-t border-border px-4 py-3"
                      >
                        {/* ⚠️ « SUIVRE MA COMMANDE » A ÉTÉ RETIRÉ LE 21.08,
                            et ce n'est pas un oubli.
                            La page de suivi exige un jeton d'accès. Ce jeton
                            venait de `loyalty/lookup` — une route OUVERTE,
                            dont la seule clé est un numéro de téléphone.
                            Elle est donc devenue le distributeur des clés
                            qu'on venait de poser : la garde était annulée par
                            sa propre distribution. Le jeton en a été retiré.
                            Il n'existe AUCUN chemin propre pour le redonner
                            ici : toute route qui l'échangerait contre un
                            téléphone recréerait exactement le trou qu'on
                            vient de fermer.
                            Le lien revient AVEC la session client signée, et
                            pas avant. En attendant, le client garde ses deux
                            vrais accès : la redirection après commande, et
                            le lien de son e-mail de confirmation. */}
                        {(!etat || etat.statut === "chargement") && (
                          <p className="text-sm text-mute">Chargement…</p>
                        )}
                        {etat?.statut === "erreur" && (
                          <p className="text-sm text-rialto">
                            Impossible d&apos;afficher le détail. Réessayez
                            dans un instant.
                          </p>
                        )}
                        {etat?.statut === "ok" && (
                          <>
                            <ul className="space-y-2">
                              {etat.detail.lignes.map((l, i) => (
                                <li
                                  key={`${order.id}-${i}`}
                                  className="flex items-start justify-between gap-3 text-sm"
                                >
                                  <div className="min-w-0">
                                    <span className="font-medium text-ink">
                                      {l.quantite} × {l.nom}
                                    </span>
                                    {l.options.length > 0 && (
                                      <span className="block text-xs text-mute">
                                        {l.options.join(" · ")}
                                      </span>
                                    )}
                                    {l.notes && (
                                      <span className="block text-xs italic text-mute">
                                        « {l.notes} »
                                      </span>
                                    )}
                                  </div>
                                  <span className="tabular shrink-0 text-ink">
                                    {formatCHF(l.montant)}
                                  </span>
                                </li>
                              ))}
                            </ul>

                            <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm">
                              <div className="flex justify-between text-mute">
                                <span>Sous-total</span>
                                <span className="tabular">
                                  {formatCHF(etat.detail.montants.sous_total)}
                                </span>
                              </div>
                              {etat.detail.montants.livraison > 0 && (
                                <div className="flex justify-between text-mute">
                                  <span>Frais de livraison</span>
                                  <span className="tabular">
                                    {formatCHF(etat.detail.montants.livraison)}
                                  </span>
                                </div>
                              )}
                              {etat.detail.montants.remise > 0 && (
                                <div className="flex justify-between text-mute">
                                  <span>Remise</span>
                                  <span className="tabular">
                                    −{formatCHF(etat.detail.montants.remise)}
                                  </span>
                                </div>
                              )}
                              <div className="flex justify-between font-bold text-ink">
                                {/* « Payé » n'est vrai QUE sur une commande
                                    terminée. Sur une commande annulée, le
                                    client n'a rien payé et ne paiera rien ;
                                    sur une commande en cours, il paiera au
                                    livreur (aucun paiement en ligne). */}
                                <span>
                                  {order.status === "completed"
                                    ? "Total payé"
                                    : order.status === "cancelled"
                                      ? "Montant de la commande annulée"
                                      : "Total à régler au livreur"}
                                </span>
                                <span className="tabular">
                                  {formatCHF(etat.detail.montants.total)}
                                </span>
                              </div>
                            </div>

                          </>
                        )}
                      </div>
                    )}
                    {/* Phase 11 C7 : bouton recommander */}
                    <div className="border-t border-border px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => handleReorder(order.order_number)}
                        disabled={isReordering}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-rialto/10 px-3 py-2 text-sm font-semibold text-rialto transition hover:bg-rialto hover:text-white disabled:opacity-60"
                      >
                        {isReordering ? (
                          <>
                            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Ajout au panier…
                          </>
                        ) : (
                          <>
                            🔁 Recommander en 1 clic
                          </>
                        )}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
