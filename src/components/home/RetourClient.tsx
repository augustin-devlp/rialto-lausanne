"use client";

/**
 * RetourClient — É8, réduit au FILET DE TRANSITION (finitions 20.08).
 *
 * Le raccourci nominal est désormais SERVEUR (cookie-drapeau
 * rialto_adresse → redirect /menu avant tout rendu : plus de flash).
 * Ce composant ne sert plus qu'aux clients qualifiés AVANT l'ère du
 * cookie (adresse en localStorage, cookie absent) : il re-qualifie une
 * fois, POSE le cookie via writeAddress, et redirige — le flash ne peut
 * les concerner qu'une seule fois. La re-qualification récurrente vit
 * sur /menu (MenuClient).
 *
 * ?need_address=1 (demande explicite de modification) désactive tout.
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
