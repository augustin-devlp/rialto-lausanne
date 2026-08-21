"use client";

/**
 * UpsellPanel V2 — Phase 12 Upsell Monstre.
 *
 * Suggestions personnalisées via /api/rialto/upsell (scoring + Gemini).
 * Debounce 800ms après stabilité panier. Skeleton pendant la requête.
 * Tracking shown/accepted/dismissed via /api/rialto/upsell/track.
 *
 * v2 (D3) — garde de session : dès qu'un client accepte OU ignore une
 * suggestion, le panneau reste silencieux pour toute la session (aucun fetch,
 * aucun rendu). Le cooldown serveur 3×/30j reste inchangé.
 * v2 (fidélité) — bandeau discret « Plus que X tampons » au-dessus des
 * suggestions, alimenté par la carte déjà résolue au lookup (zéro appel réseau
 * en plus). Lecture seule stricte.
 */

import { useEffect, useRef, useState } from "react";
import type { CartItem } from "@/lib/types";
import { formatCHF } from "@/lib/format";
import { readAddress } from "@/lib/clientStore";
import { readCustomerSession } from "@/lib/customerSession";

const DEBOUNCE_MS = 800;

// D3 — clé de garde de session (accepté OU ignoré → panneau clos pour la session).
const SESSION_KEY = "rialto:upsell-session-done";

function readSessionDone(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    // Safari en navigation privée peut faire throw sessionStorage.
    return false;
  }
}

function markSessionDone(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* Safari privé : ignore silencieusement. */
  }
}

type Suggestion = {
  menu_item_id: string;
  name: string;
  price: number;
  image_url?: string;
  message: string;
  category: string;
  score: number;
  reasons: string[];
  /** Renseigné UNIQUEMENT par le chemin P2 : de quoi afficher le coût net
   *  et sa décomposition. Voir le rendu plus bas. */
  palier?: {
    ecart: number;
    frais_economises: number;
    cout_net: number;
  } | null;
};

// Carte fidélité minimale, capturée au passage du lookup existant (aucun
// appel réseau supplémentaire). Uniquement les champs utiles au bandeau.
type LoyaltyCard = {
  current_stamps: number;
  stamps_required: number;
};

type Props = {
  cart: CartItem[];
  onAdd: (menu_item_id: string) => void;
};

export default function UpsellPanel({ cart, onAdd }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [card, setCard] = useState<LoyaltyCard | null>(null);
  const [sessionDone, setSessionDone] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ⚠️ LE CODE POSTAL FAIT PARTIE DE LA CLÉ DE L'EFFET (corrigé 21.08).
  // Il était lu DANS le fetch, mais l'effet ne dépendait que du panier :
  // un client qui saisissait 1010 (frais 10), voyait « la livraison passe
  // de 10.00 à 0.00 », puis corrigeait pour Chailly (frais 0.00) gardait
  // à l'écran une promesse qui n'a jamais existé pour sa zone — le panier
  // n'ayant pas bougé, rien ne se recalculait. C'est du donné-repris, et
  // la condition ③ d'Augustin ne pouvait pas être tenue sans ça.
  // On écoute le MÊME événement que le reste du tiroir.
  /** P7 : le panier est SOUS LE MINIMUM et aucun article seul ne le
   *  débloque. On affiche alors le MONTANT, sans proposer d'article. */
  const [blocage, setBlocage] = useState<{ manque: number } | null>(null);
  const [codePostal, setCodePostal] = useState<string | null>(
    () => readAddress()?.postal_code ?? null,
  );
  useEffect(() => {
    const maj = () => setCodePostal(readAddress()?.postal_code ?? null);
    maj();
    window.addEventListener("rialto:address-updated", maj);
    return () => window.removeEventListener("rialto:address-updated", maj);
  }, []);

  // Stable key pour éviter fetch inutile
  const cartKey = cart
    .map((c) => `${c.menu_item_id}x${c.quantity}`)
    .sort()
    .join("|");

  // Au mount : si le panneau a déjà été fermé cette session (D3) → silence
  // total, on ne résout même pas le client. Sinon on résout customer_id ET la
  // carte fidélité depuis la session locale via le lookup existant.
  useEffect(() => {
    if (readSessionDone()) {
      setSessionDone(true);
      return;
    }
    const session = readCustomerSession();
    if (!session?.phone) return;
    (async () => {
      try {
        const r = await fetch(
          `/api/rialto/loyalty/lookup?phone=${encodeURIComponent(session.phone)}`,
        );
        if (r.ok) {
          const b = (await r.json()) as {
            customer?: { id: string } | null;
            card?: {
              current_stamps?: number;
              stamps_required?: number;
            } | null;
          };
          if (b.customer) setCustomerId(b.customer.id);
          if (
            b.card &&
            typeof b.card.current_stamps === "number" &&
            typeof b.card.stamps_required === "number"
          ) {
            setCard({
              current_stamps: b.card.current_stamps,
              stamps_required: b.card.stamps_required,
            });
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    // D3 : panneau clos pour la session → aucun fetch, on nettoie tout.
    if (sessionDone) {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      setSuggestions([]);
      setLoading(false);
      return;
    }

    if (cart.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // ⚠️ ON VIDE AVANT DE REFETCHER. Sans ça, l'ancienne carte — qui
    // affiche un PRIX — restait visible et intacte pendant le debounce et
    // le réseau : le client retirait une pizza et lisait encore
    // « la livraison passe de 10.00 à 0.00 » sur un panier qui venait de
    // repasser sous le seuil. Une carte qui affiche un prix ne survit
    // jamais à un changement de son assiette.
    setSuggestions([]);
    setBlocage(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const resp = await fetch(`/api/rialto/upsell`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            cart_items: cart.map((c) => ({
              menu_item_id: c.menu_item_id,
              quantity: c.quantity,
              // ⚠️ LES OPTIONS SONT ENVOYÉES, et c'est indispensable depuis
              // le 21.08. Sans elles, le serveur calculait l'assiette du
              // palier en Σ prix × quantité — SANS les suppléments — alors
              // que le checkout et la facturation les comptent. Un panier
              // à 36 de base + 5 d'extras passait pour 36 : le message
              // annonçait une livraison offerte à venir sur un panier qui
              // l'avait DÉJÀ, à deux blocs d'un « Livraison offerte ✓ ».
              // On n'envoie que le GROUPE et le NOM : le montant du
              // supplément est relu en base côté serveur.
              options: (c.options ?? []).map((o) => ({
                group: o.group,
                name: o.name,
              })),
            })),
            customer_id: customerId,
            // Le SEUL montant qu'on envoie est… aucun. On envoie le code
            // postal, le serveur relit la zone et le seuil en base.
            postal_code: codePostal ?? undefined,
          }),
          signal: ac.signal,
        });
        if (!resp.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await resp.json()) as {
          ok?: boolean;
          suggestions?: Suggestion[];
          blocage?: { manque: number } | null;
        };
        const list = data.suggestions ?? [];
        setBlocage(data.blocage ?? null);
        setSuggestions(list);

        // Track shown
        for (const s of list) {
          fetch(`/api/rialto/upsell/track`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              customer_id: customerId,
              suggested_item_id: s.menu_item_id,
              suggested_category: s.category,
              action: "shown",
              cart_item_ids: cart.map((c) => c.menu_item_id),
              score: s.score,
              reasons: s.reasons,
            }),
          }).catch(() => {});
        }
      } catch (err) {
        const msg = err instanceof Error ? err.name : String(err);
        if (msg !== "AbortError") setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, customerId, sessionDone, codePostal]);

  const handleAdd = (s: Suggestion) => {
    onAdd(s.menu_item_id);
    // Tracking accepted TOUJOURS avant fermeture (ne casse pas les stats).
    fetch(`/api/rialto/upsell/track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        suggested_item_id: s.menu_item_id,
        suggested_category: s.category,
        action: "accepted",
        cart_item_ids: cart.map((c) => c.menu_item_id),
      }),
    }).catch(() => {});
    // D3 : accepter ferme le panneau pour toute la session (panier déjà augmenté).
    markSessionDone();
    setSessionDone(true);
  };

  const handleDismiss = (s: Suggestion) => {
    // Tracking dismissed TOUJOURS avant fermeture.
    fetch(`/api/rialto/upsell/track`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customer_id: customerId,
        suggested_item_id: s.menu_item_id,
        suggested_category: s.category,
        action: "dismissed",
        cart_item_ids: cart.map((c) => c.menu_item_id),
      }),
    }).catch(() => {});
    // D3 : ignorer ferme aussi le panneau pour toute la session.
    markSessionDone();
    setSessionDone(true);
  };

  // D3 : panneau clos pour la session → rien du tout.
  if (sessionDone) return null;
  if (cart.length === 0) return null;

  if (loading && (!suggestions || suggestions.length === 0)) {
    return (
      <div className="mt-6 space-y-2">
        <UpsellSkeleton />
      </div>
    );
  }

  // ⚠️ LE BLOCAGE PASSE AVANT LE « rien à dire ». Le client est sous le
  // minimum de sa zone et aucun article seul ne l'en sort : se taire le
  // laisserait bloqué sans savoir de combien. On dit ce qui débloque, pas
  // ce qu'on gagne — c'est du déblocage, pas de la vente.
  if (blocage) {
    return (
      <div className="mt-3 rounded-2xl border border-border bg-white p-3.5">
        <p className="text-sm font-semibold text-ink">
          Il manque {formatCHF(blocage.manque)} pour livrer chez vous.
        </p>
        <p className="mt-0.5 text-[11px] text-mute">
          Ajoutez ce qu&apos;il vous plaît pour atteindre le minimum.
        </p>
      </div>
    );
  }

  if (!suggestions || suggestions.length === 0) return null;

  // Bandeau fidélité : uniquement si carte résolue ET le panneau affiche des
  // suggestions. Panneau silencieux (retours null ci-dessus) → pas de bandeau.
  const stampsLeft = card ? card.stamps_required - card.current_stamps : 0;
  const showLoyaltyBanner = card !== null && stampsLeft >= 1;

  return (
    <section className="mt-6 space-y-2">
      {showLoyaltyBanner && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2.5 text-xs font-medium text-ink">
          <span>
            Plus que {stampsLeft} tampon{stampsLeft > 1 ? "s" : ""} avant votre
            récompense 🎁
          </span>
        </div>
      )}
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-mute">
          ✨ On vous conseille aussi
        </span>
      </div>
      {suggestions.map((s) => (
        <div
          key={s.menu_item_id}
          className="animate-fade-up relative overflow-hidden rounded-2xl border border-border bg-white shadow-card"
        >
          <button
            type="button"
            onClick={() => handleDismiss(s)}
            aria-label="Ignorer"
            // Sur la photo : pastille blanche pour rester lisible quelle que
            // soit l'image.
            className="absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-mute shadow-sm transition hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
            >
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
          {s.image_url && (
            // LA PHOTO EST L'ELEMENT PRINCIPAL (spec Augustin 21.08) :
            // bandeau pleine largeur en 16/9 au lieu d'une vignette 56 px
            // qui ne donnait pas envie. Hauteur bornee pour ne pas manger
            // le tiroir sur les petits ecrans.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.image_url}
              alt={s.name}
              className="aspect-[16/9] max-h-44 w-full object-cover"
            />
          )}
          <div className="flex items-end justify-between gap-3 p-3.5">
            <div className="min-w-0 flex-1">
              <p className="mb-0.5 text-xs italic text-mute">{s.message}</p>
              <p className="truncate font-display text-base font-bold text-rialto-dark">
                {s.name}
              </p>
              {s.palier ? (
                /* ═══ CHEMIN P2 — LE SUJET EST LA FACTURE, PAS L'ARTICLE ══
                   ⚠️ PAS DE PRIX BARRÉ. Un prix barré est une ALLÉGATION :
                   la convention (et l'OIP) veut qu'il soit un prix de
                   référence antérieur DU MÊME ARTICLE. Ici l'article n'est
                   pas remisé du tout — c'est la FACTURE qui baisse parce
                   que les frais de livraison sautent. Barrer 9.00 pour
                   afficher 4.00 disait « ce dessert est à 4 francs » :
                   faux, et en Suisse le prix affiché engage.
                   ⚠️ ET « OFFERT » EST INTERDIT sur un article facturé.
                   Corrigé le 21.08 (Augustin), même racine.
                   La décomposition reste TOUJOURS affichée — condition ②. */
                <>
                  <p className="text-sm font-semibold text-ink">
                    {s.palier.cout_net > 0
                      ? `votre total ne monte que de ${formatCHF(s.palier.cout_net)}`
                      : s.palier.cout_net === 0
                        ? "votre total ne bouge pas"
                        : `et payez ${formatCHF(Math.abs(s.palier.cout_net))} de MOINS`}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-mute">
                    {formatCHF(s.price)} l&apos;article, et la livraison
                    passe de {formatCHF(s.palier.frais_economises)} à{" "}
                    {formatCHF(0)}
                  </p>
                </>
              ) : (
                <p className="tabular text-sm font-semibold text-ink">
                  {formatCHF(s.price)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleAdd(s)}
              className="shrink-0 rounded-full bg-rialto px-3 py-2 text-xs font-bold text-white transition hover:bg-rialto-dark"
            >
              + Ajouter
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}

function UpsellSkeleton() {
  return (
    // Meme forme que la carte reelle (photo dominante) : un squelette qui
    // annonce autre chose que ce qui arrive est un texte perime visuel.
    <div className="overflow-hidden rounded-2xl border border-border bg-white">
      <div className="aspect-[16/9] max-h-44 w-full animate-pulse bg-border" />
      <div className="space-y-2 p-3.5">
        <div className="h-3 w-3/4 animate-pulse rounded bg-border" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-border" />
      </div>
    </div>
  );
}
