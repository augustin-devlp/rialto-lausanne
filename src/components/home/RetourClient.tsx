"use client";

/**
 * RetourClient — É8 refonte UI lot 1 (20.08.2026).
 *
 * L'adresse n'est demandée qu'à la PREMIÈRE visite : un client qui
 * revient avec une adresse qualifiée en localStorage arrive directement
 * sur le menu. GARDE-FOU (spec Augustin) : RE-QUALIFICATION SILENCIEUSE
 * avant toute redirection — les valeurs de zone (frais/minimum/ETA)
 * sont relues en base via l'API de check existante :
 *   - zone couverte  → valeurs FRAÎCHES écrites puis /menu (jamais de
 *     frais ou minimum périmés à l'écran) ;
 *   - zone disparue/po_box → adresse purgée, le gate reprend la main ;
 *   - erreur réseau  → AUCUNE redirection (le gate reste, prérempli) —
 *     on ne redirige jamais sur des valeurs qu'on n'a pas pu vérifier.
 *
 * ?need_address=1 (demande explicite de modification depuis le header ou
 * le menu) désactive la redirection.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearAddress, readAddress, writeAddress } from "@/lib/clientStore";

export default function RetourClient({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("need_address") === "1") return;
    const a = readAddress();
    if (!a) return;

    let annule = false;
    (async () => {
      try {
        const url = new URL("/api/delivery-zones/check", window.location.origin);
        url.searchParams.set("restaurant_id", restaurantId);
        url.searchParams.set("postal_code", a.postal_code);
        const res = await fetch(url.toString());
        if (annule || !res.ok) return;
        const body = (await res.json()) as {
          covered: boolean;
          zone?: {
            id: string;
            postal_code: string;
            city: string | null;
            delivery_fee: number;
            min_order_amount: number;
            estimated_delivery_minutes: number;
          };
        };
        if (annule) return;
        // Le client a commencé à saisir dans le gate (réseau lent, il veut
        // probablement CHANGER d'adresse) : on ne l'arrache pas en pleine
        // frappe (relecture 20.08).
        if (
          document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement
        ) {
          return;
        }
        if (body.covered && body.zone) {
          writeAddress({
            address: a.address,
            postal_code: body.zone.postal_code,
            city: body.zone.city,
            zone_id: body.zone.id,
            delivery_fee: Number(body.zone.delivery_fee),
            min_order_amount: Number(body.zone.min_order_amount),
            estimated_delivery_minutes: body.zone.estimated_delivery_minutes,
          });
          router.replace("/menu");
        } else {
          // Zone désactivée entre-temps (ou NPA devenu non desservi) :
          // l'adresse mémorisée ment — on la purge, le gate reprend.
          clearAddress();
        }
      } catch {
        /* Erreur réseau : rester sur la home, le gate prérempli suffit. */
      }
    })();
    return () => {
      annule = true;
    };
  }, [router, restaurantId]);

  return null;
}
