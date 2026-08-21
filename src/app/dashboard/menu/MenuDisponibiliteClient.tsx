"use client";

/**
 * Écran « Menu » du dashboard — LA DISPONIBILITÉ, ET RIEN D'AUTRE.
 *
 * Objectif (Augustin 21.08) : Mehmet retire un plat en rupture en TROIS
 * SECONDES depuis son téléphone, en plein service, et le remet aussi vite.
 *
 * ⚠️ PÉRIMÈTRE NON NÉGOCIABLE : il peut basculer un article entre
 * disponible et épuisé. C'EST TOUT. Prix, nom, description, photo,
 * catégorie, allergènes, coup de cœur : affichés en LECTURE SEULE (nom et
 * prix) ou pas affichés du tout — JAMAIS dans un champ modifiable
 * désactivé, qui donnerait envie d'essayer. Le menu est en version
 * finale ; tout le reste passe par Augustin.
 *
 * 🔴 RÈGLE N°1 (celle de la caisse, elle vaut ici) : JAMAIS D'ÉCHEC
 * SILENCIEUX. L'interrupteur bascule tout de suite à l'écran et
 * l'écriture part en arrière-plan ; si elle échoue, l'interrupteur
 * REVIENT à son état d'origine ET un message explicite s'affiche. Un plat
 * qu'on croit épuisé alors qu'il est toujours en vente est le PIRE
 * résultat possible.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCHF } from "@/lib/format";

type Article = {
  id: string;
  nom: string;
  prix: number;
  epuise: boolean;
  categorie: string;
  ordre_categorie: number;
  ordre: number;
};

type Filtre = "tous" | "dispo" | "epuises";

export default function MenuDisponibiliteClient() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreurGlobale, setErreurGlobale] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  /** Articles dont l'écriture est en vol : interrupteur désactivé pour
   *  qu'un double appui ne parte pas deux fois. */
  const [enVol, setEnVol] = useState<Record<string, true>>({});
  /** Message d'erreur PAR ARTICLE, affiché sous sa ligne. */
  const [erreurs, setErreurs] = useState<Record<string, string>>({});
  const [confirmationTout, setConfirmationTout] = useState(false);
  const [toutEnCours, setToutEnCours] = useState(false);

  /** Compteur de génération : incrémenté à CHAQUE rechargement complet.
   *  Une écriture par ligne partie avant un rechargement ne doit plus
   *  toucher l'écran quand elle revient après — sinon sa réponse tardive
   *  réécrit par-dessus une vérité plus fraîche (cas réel : Mehmet bascule
   *  un plat sur un réseau lent, puis tape « Tout remettre » ; le PATCH
   *  arrive en dernier et réaffiche ÉPUISÉ un plat remis en vente). */
  const generation = useRef(0);

  async function charge() {
    setChargement(true);
    setErreurGlobale(null);
    try {
      const res = await fetch("/api/dashboard/menu", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { articles: Article[] };
      generation.current += 1;
      setArticles(body.articles ?? []);
      // La liste qui arrive est la vérité : les messages d'erreur des
      // lignes portaient sur l'état d'AVANT, ils ne veulent plus rien dire.
      setErreurs({});
    } catch {
      setErreurGlobale(
        "Impossible de charger la carte. Vérifiez la connexion et réessayez.",
      );
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    void charge();
  }, []);

  /** Bascule OPTIMISTE avec retour arrière en cas d'échec. */
  async function bascule(article: Article) {
    if (enVol[article.id]) return;
    const cible = !article.epuise;
    const avant = article.epuise;
    // Génération au moment du départ : si la liste est rechargée entre-temps,
    // cette réponse est périmée et ne doit plus rien réécrire.
    const gen = generation.current;
    const perime = () => generation.current !== gen;
    /** Le serveur a-t-il explicitement REFUSÉ (4xx) ? Dans ce seul cas on
     *  sait que rien n'a été écrit. Un 5xx ou une coupure peut survenir
     *  APRÈS le commit : on n'affirme alors rien. */
    let refusExplicite = false;

    setEnVol((v) => ({ ...v, [article.id]: true }));
    setErreurs((e) => {
      const { [article.id]: _retire, ...reste } = e;
      return reste;
    });
    // 1. L'écran bascule TOUT DE SUITE.
    setArticles((liste) =>
      liste.map((a) => (a.id === article.id ? { ...a, epuise: cible } : a)),
    );

    try {
      const res = await fetch("/api/dashboard/menu", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: article.id, is_out_of_stock: cible }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        epuise?: boolean;
      } | null;
      if (res.status >= 400 && res.status < 500) refusExplicite = true;
      if (!res.ok || !body?.ok) throw new Error("echec");
      if (perime()) return;
      // 2. On s'aligne sur l'état RELU par le serveur, pas sur ce qu'on
      //    croyait avoir écrit.
      setArticles((liste) =>
        liste.map((a) =>
          a.id === article.id ? { ...a, epuise: body.epuise === true } : a,
        ),
      );
    } catch {
      if (perime()) return;
      // 3. ÉCHEC : retour à l'état d'origine + message.
      setArticles((liste) =>
        liste.map((a) => (a.id === article.id ? { ...a, epuise: avant } : a)),
      );
      // ⚠️ On n'AFFIRME l'état de la carte que si le serveur a refusé lui-même.
      // Une coupure réseau ou un 5xx peut arriver APRÈS que l'écriture est
      // passée : dire « toujours en vente » serait alors un mensonge dans le
      // sens dangereux — Mehmet croirait le plat retiré pendant que le site
      // le vend. Quand on ne sait pas, on le dit.
      setErreurs((e) => ({
        ...e,
        [article.id]: refusExplicite
          ? cible
            ? "Pas enregistré — le plat est TOUJOURS EN VENTE. Réessayez."
            : "Pas enregistré — le plat est TOUJOURS ÉPUISÉ. Réessayez."
          : "Pas de réponse — on ne sait pas si c'est enregistré. Rechargez la page pour voir l'état réel.",
      }));
    } finally {
      setEnVol((v) => {
        const { [article.id]: _retire, ...reste } = v;
        return reste;
      });
    }
  }

  async function toutRemettre() {
    setToutEnCours(true);
    setErreurGlobale(null);
    let echoue = false;
    try {
      const res = await fetch("/api/dashboard/menu/tout-remettre", {
        method: "POST",
      });
      if (!res.ok) throw new Error("echec");
      setConfirmationTout(false);
    } catch {
      echoue = true;
    } finally {
      setToutEnCours(false);
      // La vérité vient du serveur dans TOUS les cas, succès comme échec.
      await charge();
      // ⚠️ Le message est posé APRÈS `charge()`, qui remet erreurGlobale à
      // null — posé avant, il serait effacé aussitôt.
      // Et il n'affirme JAMAIS « rien n'a été changé » : cet appel remet
      // toute la carte en vente d'un seul UPDATE ; si la réponse se perd
      // après le commit, la carte EST remise et l'affirmation serait fausse
      // dans le sens dangereux.
      if (echoue) {
        setErreurGlobale(
          "On ne sait pas si ça a marché. La liste vient d'être rechargée : vérifiez le nombre de plats épuisés ci-dessus.",
        );
      }
    }
  }

  const nbEpuises = articles.filter((a) => a.epuise).length;

  // Recherche insensible aux accents (« pave » trouve « Pavé »).
  const normalise = (t: string) =>
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const groupes = useMemo(() => {
    const terme = normalise(recherche.trim());
    const visibles = articles.filter((a) => {
      if (filtre === "dispo" && a.epuise) return false;
      if (filtre === "epuises" && !a.epuise) return false;
      if (terme && !normalise(a.nom).includes(terme)) return false;
      return true;
    });
    const map = new Map<string, Article[]>();
    for (const a of visibles) {
      const liste = map.get(a.categorie) ?? [];
      liste.push(a);
      map.set(a.categorie, liste);
    }
    return [...map.entries()];
  }, [articles, recherche, filtre]);

  // Convention dashboard : le layout fournit déjà <main> et la navigation
  // (BottomNav). Un <main> imbriqué serait du HTML invalide — deux
  // landmarks pour un lecteur d'écran — et `container-hero` rajouterait son
  // padding par-dessus celui du layout, rendant CET écran plus étroit que
  // tous les autres.
  return (
    <div className="pb-6">
      <h1 className="font-display text-2xl font-bold text-ink">Menu</h1>
      <p className="mt-1 text-sm text-mute">
        Un plat est épuisé ? Retirez-le. Il revient ? Remettez-le en vente.
      </p>

      {/* ─── En-tête : combien d'épuisés + tout remettre ─── */}
      <div className="mt-4 rounded-2xl border border-border bg-white p-4 shadow-card">
        {nbEpuises === 0 ? (
          <p className="text-sm font-semibold text-ink">
            Tous les plats sont disponibles.
          </p>
        ) : (
          <>
            <p className="text-sm font-semibold text-ink">
              {nbEpuises} plat{nbEpuises > 1 ? "s" : ""} épuisé
              {nbEpuises > 1 ? "s" : ""} en ce moment
            </p>
            {!confirmationTout ? (
              <button
                type="button"
                onClick={() => setConfirmationTout(true)}
                className="mt-3 w-full rounded-xl border border-border px-3 py-2.5 text-sm font-semibold text-ink transition hover:border-ink"
              >
                Tout remettre en vente
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-border bg-neutral-50 p-3">
                <p className="text-sm text-ink">
                  Remettre {nbEpuises} plat{nbEpuises > 1 ? "s" : ""} en vente ?
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void toutRemettre()}
                    disabled={toutEnCours}
                    className="btn-primary flex-1 disabled:opacity-50"
                  >
                    {toutEnCours ? "…" : "Oui, tout remettre"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmationTout(false)}
                    disabled={toutEnCours}
                    className="flex-1 rounded-btn border border-border px-3 py-2 text-sm font-semibold text-ink"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {erreurGlobale && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto"
        >
          <p>{erreurGlobale}</p>
          {/* Le message dit « réessayez » : il faut de quoi le faire, sinon
              seul un rechargement du navigateur s'en sort et rien ne le dit. */}
          <button
            type="button"
            onClick={() => void charge()}
            disabled={chargement}
            className="mt-2 rounded-lg border border-rialto/40 px-3 py-1.5 font-semibold transition hover:bg-rialto/10 disabled:opacity-50"
          >
            {chargement ? "…" : "Réessayer"}
          </button>
        </div>
      )}

      {/* ─── Recherche + filtre ─── */}
      {/* `top-14` et non `top-0` : l'en-tête du dashboard est lui-même
          `sticky top-0 z-30 h-14` et opaque. À `top-0`, la recherche et les
          filtres passent DERRIÈRE lui dès le premier défilement — l'outil
          censé rendre les 121 articles utilisables disparaît. */}
      <div className="sticky top-14 z-10 -mx-4 mt-4 space-y-2 bg-white/95 px-4 py-3 backdrop-blur">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Chercher un plat…"
          aria-label="Chercher un plat"
          className="w-full rounded-xl border border-border px-4 py-3 text-base focus:border-[#C73E1D] focus:outline-none"
        />
        <div className="flex gap-2">
          {(
            [
              ["tous", "Tous"],
              ["dispo", "Disponibles"],
              ["epuises", "Épuisés"],
            ] as [Filtre, string][]
          ).map(([cle, libelle]) => (
            <button
              key={cle}
              type="button"
              onClick={() => setFiltre(cle)}
              aria-pressed={filtre === cle}
              className={`flex-1 rounded-btn border px-3 py-2 text-sm font-semibold transition ${
                filtre === cle
                  ? "border-[#C73E1D] bg-white text-ink shadow-card"
                  : "border-border bg-white text-mute"
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>

      {/* ─── La liste ─── */}
      {chargement ? (
        <p className="mt-6 text-sm text-mute">Chargement de la carte…</p>
      ) : groupes.length === 0 ? (
        <p className="mt-6 text-sm text-mute">
          Aucun plat ne correspond.{" "}
          {recherche && (
            <button
              type="button"
              onClick={() => setRecherche("")}
              className="underline"
            >
              Effacer la recherche
            </button>
          )}
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          {groupes.map(([categorie, liste]) => {
            const epuisesCat = liste.filter((a) => a.epuise).length;
            return (
              <section key={categorie}>
                <h2 className="mb-2 flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-wider text-mute">
                  <span>{categorie}</span>
                  {epuisesCat > 0 && (
                    <span className="text-rialto">
                      {epuisesCat} épuisé{epuisesCat > 1 ? "s" : ""}
                    </span>
                  )}
                </h2>
                <ul className="overflow-hidden rounded-2xl border border-border bg-white shadow-card">
                  {liste.map((a, i) => (
                    <li
                      key={a.id}
                      className={i > 0 ? "border-t border-border" : ""}
                    >
                      <div className="flex items-center gap-3 p-3.5">
                        <div className="min-w-0 flex-1">
                          <div
                            className={`truncate font-medium ${
                              a.epuise ? "text-mute line-through" : "text-ink"
                            }`}
                          >
                            {a.nom}
                          </div>
                          {a.epuise && (
                            <span className="mt-0.5 inline-block rounded-full bg-rialto/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-rialto">
                              Épuisé
                            </span>
                          )}
                        </div>
                        <span className="tabular shrink-0 text-sm text-mute">
                          {formatCHF(a.prix)}
                        </span>
                        {/* Interrupteur : ALLUMÉ = disponible. */}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={!a.epuise}
                          aria-label={`${a.nom} — ${a.epuise ? "épuisé" : "disponible"}`}
                          disabled={Boolean(enVol[a.id])}
                          onClick={() => void bascule(a)}
                          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-40 ${
                            a.epuise ? "bg-border" : "bg-emerald-500"
                          }`}
                        >
                          <span
                            className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                              a.epuise ? "left-1" : "left-6"
                            }`}
                          />
                        </button>
                      </div>
                      {erreurs[a.id] && (
                        <p
                          role="alert"
                          className="px-3.5 pb-3 text-xs font-semibold text-rialto"
                        >
                          ⚠️ {erreurs[a.id]}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
