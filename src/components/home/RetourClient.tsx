"use client";

/**
 * RetourClient — É8, filet PERMANENT derrière le raccourci serveur.
 *
 * Le raccourci nominal est SERVEUR (cookie-drapeau rialto_adresse →
 * redirect /menu avant tout rendu : plus de flash). Ce filet couvre les
 * cas « localStorage présent, cookie absent » : clients d'avant l'ère du
 * cookie, ET SURTOUT Safari/iPhone — ITP plafonne à 7 JOURS les cookies
 * posés par document.cookie (le max-age 6 mois est ignoré) : un client
 * iOS revenant après une semaine repasse par ici, voit UN flash, et le
 * cookie est re-posé via writeAddress pour la semaine suivante. NE PAS
 * SUPPRIMER ce composant (relecture 20.08). La re-qualification
 * récurrente vit sur /menu (MenuClient).
 *
 * ?need_address=1 (demande explicite de modification) désactive tout.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { clearAddress, readAddress, writeAddress } from "@/lib/clientStore";

import { minimumDeZone } from "@/lib/delivery/minimum";
export default function RetourClient({
  restaurantId,
}: {
  restaurantId: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ?need_address=1 (modifier l'adresse) ET ?infos=1 (« Nous trouver » :
    // consultation volontaire de la home) désactivent la redirection —
    // le bug du 20.08 : l'exemption infos n'existait que côté serveur,
    // ce filet client renvoyait quand même au menu.
    if (params.get("need_address") === "1") return;
    if (params.get("infos") === "1") return;
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
        // `minimumDeZone` : `Number(null)` vaut 0 — « aucun minimum ».
        min_order_amount: minimumDeZone(body.zone),
            estimated_delivery_minutes: body.zone.estimated_delivery_minutes,
          });
          try {
            // Le check vient d'être fait : /menu n'a pas à le refaire.
            sessionStorage.setItem("RIALTO:REQUALIF_FAITE", "1");
          } catch {
            /* ignore */
          }
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
