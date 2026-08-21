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

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

  async function charge() {
    setChargement(true);
    setErreurGlobale(null);
    try {
      const res = await fetch("/api/dashboard/menu", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { articles: Article[] };
      setArticles(body.articles ?? []);
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
      if (!res.ok || !body?.ok) throw new Error("echec");
      // 2. On s'aligne sur l'état RELU par le serveur, pas sur ce qu'on
      //    croyait avoir écrit.
      setArticles((liste) =>
        liste.map((a) =>
          a.id === article.id ? { ...a, epuise: body.epuise === true } : a,
        ),
      );
    } catch {
      // 3. ÉCHEC : retour à l'état d'origine + message explicite.
      setArticles((liste) =>
        liste.map((a) => (a.id === article.id ? { ...a, epuise: avant } : a)),
      );
      setErreurs((e) => ({
        ...e,
        [article.id]: cible
          ? "Pas enregistré — le plat est TOUJOURS EN VENTE. Réessayez."
          : "Pas enregistré — le plat est TOUJOURS ÉPUISÉ. Réessayez.",
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
    try {
      const res = await fetch("/api/dashboard/menu/tout-remettre", {
        method: "POST",
      });
      if (!res.ok) throw new Error("echec");
      setConfirmationTout(false);
      await charge();
    } catch {
      setErreurGlobale(
        "Impossible de tout remettre disponible. Rien n'a été changé — réessayez.",
      );
    } finally {
      setToutEnCours(false);
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

  return (
    <main className="container-hero pb-28 pt-6">
      <Link
        href="/dashboard"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"
      >
        ← Tableau de bord
      </Link>

      <h1 className="font-display text-2xl font-bold text-ink">Menu</h1>
      <p className="mt-1 text-sm text-mute">
        Retirez un plat en rupture, remettez-le quand il revient.
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
                Tout remettre disponible
              </button>
            ) : (
              <div className="mt-3 rounded-xl border border-border bg-neutral-50 p-3">
                <p className="text-sm text-ink">
                  Remettre les {nbEpuises} plats en vente ?
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
        <p
          role="alert"
          className="mt-3 rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto"
        >
          {erreurGlobale}
        </p>
      )}

      {/* ─── Recherche + filtre ─── */}
      <div className="sticky top-0 z-10 -mx-4 mt-4 space-y-2 bg-white/95 px-4 py-3 backdrop-blur">
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
    </main>
  );
}
