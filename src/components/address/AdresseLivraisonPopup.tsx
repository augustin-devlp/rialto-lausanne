"use client";

/**
 * AdresseLivraisonPopup — LE pop-up « Détails de la livraison », UNIQUE
 * voie de modification d'adresse du site (décision Augustin 20.08, après
 * la 3e régression de la voie « home + exemption ») : l'en-tête ET le
 * checkout ouvrent CE composant — plus aucune navigation vers la home
 * pour modifier une adresse (la home ne sert qu'à la qualification
 * initiale, sans adresse existante).
 *
 * Règles (correctif bug zone R-2026-044) :
 *  - BROUILLON : rien n'est écrit pendant la saisie ; croix, voile et
 *    Échap ANNULENT (retour aux valeurs d'ouverture) ;
 *  - « Enregistrer » vérifie la zone de façon SYNCHRONE (toujours, même
 *    à NPA inchangé — tarifs rafraîchis) + cohérence ville↔zone, puis
 *    committe d'un bloc : writeAddress (→ rialto:address-updated pour
 *    l'en-tête) + fusion des champs logement dans le prefill checkout +
 *    callback onEnregistre pour l'état local de l'hôte ;
 *  - jeton de génération : un commit dont le fetch était en vol au
 *    moment d'une fermeture s'abandonne (l'annulation est tenue).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { HousingType } from "@/lib/types";
import {
  mergePrefillAdresse,
  villeSeedable,
  writeAddress,
  type QualifiedAddress,
} from "@/lib/clientStore";
import { PictoImmeuble, PictoMaison } from "@/components/ui/Pictos";

import { minimumDeZone } from "@/lib/delivery/minimum";
import AutocompleteAdresse from "@/components/address/AutocompleteAdresse";
/** Valeurs copiées dans le brouillon à l'ouverture. */
export type GraineAdresse = {
  housingType: HousingType | null;
  street: string;
  npa: string;
  ville: string;
  entryCode1: string;
  entryCode2: string;
  floor: string;
  apartmentNumber: string;
  doorbellName: string;
};

/** Résultat committé, pour synchroniser l'état local de l'hôte. */
export type CommitAdresse = {
  adresse: QualifiedAddress;
  housingType: HousingType;
  entryCode1: string;
  entryCode2: string;
  floor: string;
  apartmentNumber: string;
  doorbellName: string;
};

type Props = {
  restaurantId: string;
  ouvert: boolean;
  graine: GraineAdresse;
  /** Fermeture-ANNULATION (croix, voile, Échap) — l'hôte ferme. */
  onAnnuler: () => void;
  /** Commit réussi (writeAddress + prefill déjà faits) — l'hôte
   *  synchronise son état local et ferme. */
  onEnregistre: (commit: CommitAdresse) => void;
};

/** Jetons de liaison/génériques, ignorés des deux côtés (relecture
 *  20.08 : « saint »/« sainte » faisaient matcher Saint-Saphorin sur
 *  Villars-Sainte-Croix ; « sur »/« lausanne » sont partagés par toute
 *  la famille « -sur-Lausanne » vs les NPA lausannois nus). */
const JETONS_IGNORES = new Set([
  "sur", "sous", "pres", "les", "aux", "des", "chez", "vers",
  "saint", "sainte", "vaud", "suisse", "canton",
]);

/** Vrai si la ville saisie recoupe la commune de la zone. Règle durcie
 *  (relecture 20.08) : TOUS les jetons significatifs de la saisie doivent
 *  trouver un partenaire (égalité ou préfixe, pour absorber les petites
 *  fautes) dans le libellé de zone — « au moins un jeton commun » était
 *  aveugle sur « Cheseaux-sur-Lausanne » tapé avec un NPA lausannois.
 *  Jetons < 3 caractères, numériques et de liaison ignorés ; libellés
 *  multi-communes « A / B / C » : chaque partie compte. Ville vide ou
 *  zone sans libellé → toujours vrai (autofill). Validée contre les 59
 *  libellés réels de la grille ZL1 le 20.08. */
export function villeCompatibleZone(
  saisie: string,
  zoneCity: string | null,
): boolean {
  if (!zoneCity) return true;
  const jetons = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(
        (x) => x.length >= 3 && !/^\d+$/.test(x) && !JETONS_IGNORES.has(x),
      );
  const brut = saisie
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length >= 3 && !JETONS_IGNORES.has(x));
  const js = jetons(saisie);
  // Saisie dont TOUS les jetons sont numériques (« 1004 » retapé dans le
  // champ Ville — inversion NPA/ville) : ce n'est pas une ville, refus
  // (relecture 20.08 : le filtre numérique court-circuitait le contrôle).
  if (js.length === 0) return brut.length === 0;
  const jz = jetons(zoneCity);
  if (jz.length === 0) return true;
  return js.every((a) => jz.some((b) => a.startsWith(b) || b.startsWith(a)));
}

export default function AdresseLivraisonPopup({
  restaurantId,
  ouvert,
  graine,
  onAnnuler,
  onEnregistre,
}: Props) {
  const [dHousingType, setDHousingType] = useState<HousingType | null>(null);
  const [dStreet, setDStreet] = useState("");
  const [dNpa, setDNpa] = useState("");
  const [dVille, setDVille] = useState("");
  const [dEntryCode1, setDEntryCode1] = useState("");
  const [dEntryCode2, setDEntryCode2] = useState("");
  const [dFloor, setDFloor] = useState("");
  const [dApptNum, setDApptNum] = useState("");
  const [dDoorbell, setDDoorbell] = useState("");
  const [dZoneError, setDZoneError] = useState<string | null>(null);
  const [dSaving, setDSaving] = useState(false);
  // Jeton de génération : incrémenté à CHAQUE ouverture et
  // fermeture-annulation — un commit dont le fetch était en vol au moment
  // d'une fermeture le détecte et s'abandonne (relecture 20.08).
  const genRef = useRef(0);
  // Verrou de ré-entrée synchrone (dSaving est une valeur de rendu : deux
  // clics dans la même frame passaient tous deux le garde d'état).
  const savingRef = useRef(false);
  // « Latest ref » de onAnnuler : le handler Échap vit dans un effet
  // [ouvert] — sans la ref, il exécuterait le onAnnuler du render de
  // l'OUVERTURE (stale closure, relecture 20.08).
  const onAnnulerRef = useRef(onAnnuler);
  onAnnulerRef.current = onAnnuler;
  // Focus initial du dialog (voie unique de modification d'adresse — le
  // piège Tab complet reste à la passe a11y, documenté).
  const dialogRef = useRef<HTMLDivElement>(null);

  // (Re)seed du brouillon à chaque OUVERTURE — la graine vient de l'hôte
  // (états checkout, ou adresse+prefill pour l'en-tête). Deps [ouvert]
  // seul : la graine est reconstruite à chaque render de l'hôte, la
  // mettre en dépendance re-seederait le brouillon à chaque frappe.
  useEffect(() => {
    if (!ouvert) return;
    genRef.current += 1;
    setDHousingType(graine.housingType);
    setDStreet(graine.street);
    setDNpa(graine.npa);
    setDVille(graine.ville);
    setDEntryCode1(graine.entryCode1);
    setDEntryCode2(graine.entryCode2);
    setDFloor(graine.floor);
    setDApptNum(graine.apartmentNumber);
    setDDoorbell(graine.doorbellName);
    setDZoneError(null);
    savingRef.current = false;
    setDSaving(false);
    dialogRef.current?.focus();
    // Cleanup : fermeture OU démontage (AppHeader rend null sur
    // /checkout, /dashboard, /scan) — le jeton invalide tout fetch en
    // vol, « fermer = annuler » est tenu même à la navigation.
    return () => {
      genRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  /** Fermeture-ANNULATION : invalide par jeton tout enregistrement dont
   *  le fetch est en vol — son commit s'abandonnera au retour. */
  function fermer() {
    genRef.current += 1;
    onAnnulerRef.current();
  }

  // Verrou scroll body + Échap (pattern FilterModal).
  useEffect(() => {
    if (!ouvert) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") fermer();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const npaValide = /^\d{4}$/.test(dNpa.trim());
  const brouillonValide =
    dHousingType !== null && dStreet.trim().length >= 3 && npaValide;

  /** Commit ATOMIQUE : zone du NPA vérifiée de façon SYNCHRONE avant
   *  toute écriture — zone non desservie, ville incohérente ou réseau en
   *  échec → RIEN n'est committé, le pop-up reste ouvert avec l'erreur.
   *  Aucun repli silencieux : c'est le repli « le POST re-vérifiera »
   *  qui a produit la commande chimère R-2026-044. */
  async function enregistrer() {
    if (savingRef.current || !brouillonValide || dHousingType === null) return;
    savingRef.current = true;
    const rue = dStreet.trim();
    const npa = dNpa.trim();
    // Jeton capturé AVANT le fetch : si le pop-up est fermé (annulation)
    // ou rouvert pendant le vol, le commit ci-dessous s'abandonne.
    const gen = genRef.current;
    setDSaving(true);
    setDZoneError(null);
    try {
      // TOUJOURS re-vérifier la zone, même à NPA inchangé : le raccourci
      // « NPA identique » re-committait un zone_id et des tarifs
      // potentiellement périmés (zone recréée, frais édités au dashboard)
      // — et le remède affiché par le 409 serveur (« bouton Modifier »)
      // ne pouvait alors jamais réparer (relecture 20.08).
      const res = await fetch(
        `/api/delivery-zones/check?restaurant_id=${encodeURIComponent(
          restaurantId,
        )}&postal_code=${encodeURIComponent(npa)}`,
      );
      if (!res.ok) throw new Error(`check ${res.status}`);
      const body = (await res.json()) as {
        covered: boolean;
        reason?: "po_box" | "not_covered";
        zone?: {
          id: string;
          city: string | null;
          delivery_fee: number | string;
          min_order_amount: number | string;
          estimated_delivery_minutes: number | null;
        };
      };
      if (gen !== genRef.current) return;
      if (!body.covered || !body.zone) {
        setDZoneError(
          body.reason === "po_box"
            ? "1001 et 1002 sont des cases postales — indiquez le NPA de votre adresse de rue."
            : `Nous ne livrons pas au ${npa}. Corrigez le code postal ou choisissez une adresse desservie.`,
        );
        return;
      }
      // Cohérence ville ↔ zone (variante « NPA laissé tel quel » du bug
      // R-2026-044) : une ville qui ne recoupe pas la commune de la zone
      // signifie que le client a changé de localité SANS changer le NPA.
      if (
        body.zone.city &&
        !villeCompatibleZone(dVille.trim(), body.zone.city)
      ) {
        setDZoneError(
          `Le NPA ${npa} correspond à ${body.zone.city} — vérifiez le code postal ou la localité.`,
        );
        return;
      }
      // Ville committée : la saisie prime ; sinon le libellé de zone,
      // JAMAIS un libellé multi-communes « A / B / C » (il partait sur
      // l'étiquette livreur, le CSV et le mail — relecture 20.08).
      const ville = dVille.trim() || villeSeedable(body.zone.city) || "";
      const next: QualifiedAddress = {
        address: rue,
        postal_code: npa,
        city: ville || null,
        zone_id: body.zone.id,
        delivery_fee: Number(body.zone.delivery_fee),
        // `minimumDeZone` : `Number(null)` vaut 0 — « aucun minimum ».
        min_order_amount: minimumDeZone(body.zone),
        estimated_delivery_minutes:
          body.zone.estimated_delivery_minutes ?? 45,
      };
      // Champs appartement VIDÉS quand le logement committé est une
      // MAISON (relecture 20.08 : ils n'étaient que masqués — le livreur
      // cherchait l'interphone de l'ancien appartement devant une villa).
      const appart = dHousingType === "apartment";
      const details = {
        entryCode1: appart ? dEntryCode1.trim() : "",
        entryCode2: appart ? dEntryCode2.trim() : "",
        floor: appart ? dFloor.trim() : "",
        apartmentNumber: appart ? dApptNum.trim() : "",
        doorbellName: appart ? dDoorbell.trim() : "",
      };
      // COMMIT : stockage d'abord (writeAddress/mergePrefill sont
      // no-throw par construction et diffusent rialto:address-updated),
      // callback hôte en DERNIER — un hôte qui lève ne peut plus laisser
      // un état à moitié muté sans persistance (relecture 20.08).
      writeAddress(next);
      mergePrefillAdresse({
        housingType: dHousingType,
        street: rue,
        postalCode: npa,
        city: ville,
        ...details,
      });
      onEnregistre({
        adresse: next,
        housingType: dHousingType,
        ...details,
      });
    } catch {
      // Jeton : ne pas afficher l'erreur d'un fetch fantôme dans un
      // pop-up rouvert entre-temps.
      if (gen === genRef.current) {
        setDZoneError(
          "Impossible de vérifier votre zone de livraison — réessayez dans un instant.",
        );
      }
    } finally {
      // Jeton aussi ici (relecture 20.08) : le finally d'un fetch FANTÔME
      // (fermé puis rouvert pendant son vol) ne doit pas relâcher le
      // verrou d'un enregistrement plus récent encore en vol.
      if (gen === genRef.current) {
        savingRef.current = false;
        setDSaving(false);
      }
    }
  }

  if (!ouvert) return null;

  // PORTAL vers document.body (relecture 20.08) : rendu DANS le <header>
  // sticky z-50, le z-[70] du voile était plafonné à 50 face au reste de
  // la page — la bannière cookies (z-60) recouvrait le bouton Enregistrer
  // du bottom-sheet mobile. Le portal rend les DEUX hôtes identiques.
  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 backdrop-blur-sm md:items-center md:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) fermer();
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Détails de la livraison"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-pop outline-none md:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-bold text-ink">
            Détails de la livraison
          </h3>
          <button
            type="button"
            onClick={fermer}
            className="rounded-full p-2 text-mute hover:bg-neutral-100"
            aria-label="Fermer"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>
        <div
          className="space-y-3 transition-all duration-200"
          // Entrée dans un champ d'adresse = tenter l'ENREGISTREMENT
          // (avec sa vérification de zone), jamais la commande.
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (e.target as HTMLElement).tagName === "INPUT"
            ) {
              e.preventDefault();
              void enregistrer();
            }
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setDHousingType("house")}
              className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                dHousingType === "house"
                  ? "border-[#C73E1D] bg-white shadow-card"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="shrink-0 text-rialto">
                <PictoMaison size={26} />
              </span>
              <span className="font-bold text-ink">Maison</span>
            </button>
            <button
              type="button"
              onClick={() => setDHousingType("apartment")}
              className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                dHousingType === "apartment"
                  ? "border-[#C73E1D] bg-white shadow-card"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="shrink-0 text-rialto">
                <PictoImmeuble size={26} />
              </span>
              <span className="font-bold text-ink">Appartement</span>
            </button>
          </div>

          {dHousingType !== null && (
            <>
              {/* Autocomplétion GeoAdmin — confort de saisie uniquement.
                  La qualification de zone se fait toujours sur le NPA
                  côté serveur (`/api/delivery-zones/check`), et la saisie
                  reste entièrement libre : la liste n'oblige à rien. */}
              <AutocompleteAdresse
                valeur={dStreet}
                onChangeValeur={setDStreet}
                onChoisir={(sug) => {
                  // On ne remplit que ce qui est VIDE : on n'écrase jamais
                  // une saisie du client.
                  if (!dNpa.trim()) setDNpa(sug.npa);
                  if (!dVille.trim() && sug.ville) setDVille(sug.ville);
                }}
                placeholder="Rue et numéro (ex: Av. de Béthusy 29)"
                className="w-full rounded-xl border border-border px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={dNpa}
                  onChange={(e) => setDNpa(e.target.value)}
                  placeholder="NPA"
                  aria-label="NPA"
                  className="col-span-1 rounded-xl border border-border px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
                />
                <input
                  type="text"
                  value={dVille}
                  onChange={(e) => setDVille(e.target.value)}
                  placeholder="Ville"
                  aria-label="Ville"
                  className="col-span-2 rounded-xl border border-border px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
                />
              </div>

              {!npaValide && (
                <p className="text-xs font-medium text-rialto">
                  Indiquez un NPA à 4 chiffres.
                </p>
              )}
              {dZoneError && (
                <p className="text-xs font-medium text-rialto">
                  {dZoneError}
                </p>
              )}

              {dHousingType === "apartment" && (
                <div className="space-y-3 rounded-2xl border border-border bg-neutral-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink">
                    Pour que le livreur trouve facilement
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={dEntryCode1}
                      onChange={(e) => setDEntryCode1(e.target.value)}
                      placeholder="Code entrée 1"
                      aria-label="Code entrée 1"
                      className="rounded-xl border border-border bg-white px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={dEntryCode2}
                      onChange={(e) => setDEntryCode2(e.target.value)}
                      placeholder="Code entrée 2 (si nécessaire)"
                      aria-label="Code entrée 2"
                      className="rounded-xl border border-border bg-white px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={dFloor}
                      onChange={(e) => setDFloor(e.target.value)}
                      placeholder="Étage (ex: 3, RDC)"
                      aria-label="Étage"
                      className="rounded-xl border border-border bg-white px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
                    />
                    <input
                      type="text"
                      value={dApptNum}
                      onChange={(e) => setDApptNum(e.target.value)}
                      placeholder="N° appartement / Porte"
                      aria-label="N° appartement / Porte"
                      className="rounded-xl border border-border bg-white px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
                    />
                  </div>
                  <input
                    type="text"
                    value={dDoorbell}
                    onChange={(e) => setDDoorbell(e.target.value)}
                    placeholder="Nom sur la sonnette / interphone"
                    aria-label="Nom sur la sonnette / interphone"
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => void enregistrer()}
                disabled={dSaving || !brouillonValide}
                className="btn-primary mt-1 w-full disabled:opacity-40"
              >
                {dSaving ? "Vérification de la zone…" : "Enregistrer"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
