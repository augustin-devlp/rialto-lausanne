"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Compte = { id: string; prenom: string; telephone: string };

type Etat =
  | { phase: "verification" }
  | { phase: "choix"; comptes: Compte[] }
  | { phase: "perime" }
  | { phase: "invalide" }
  | { phase: "aucun_compte" }
  | { phase: "panne"; message: string }
  | { phase: "renvoye" };

/**
 * L'écran d'arrivée du lien de connexion.
 *
 * ⚠️ TROIS ÉTATS D'ÉCHEC DISTINCTS, ET C'EST DÉLIBÉRÉ. « Lien expiré »,
 * « lien invalide » et « plus de compte » n'appellent pas le même geste.
 * Les confondre sous un « erreur » unique laisserait le client croire
 * qu'il a fait une bêtise — alors qu'un lien périmé, c'est simplement le
 * temps qui a passé.
 */
export default function ConnexionLienClient() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("e") ?? "";
  const jeton = params.get("c") ?? "";

  const [etat, setEtat] = useState<Etat>({ phase: "verification" });
  const [envoi, setEnvoi] = useState(false);
  const [ouverture, setOuverture] = useState<string | null>(null);
  const dejaVerifie = useRef(false);
  /** Force une nouvelle vérification sans recharger la page. */
  const [essai, setEssai] = useState(0);

  /**
   * ⚠️ ON NETTOIE L'URL DÈS QUE LE JETON EST LU.
   * Sans ça, l'adresse et le jeton restent dans la barre d'adresse, donc
   * dans l'historique, dans le presse-papier d'un partage, et dans le
   * `Referer` de la première ressource externe chargée. Le jeton reste en
   * mémoire dans ce composant, ce qui suffit à finir la connexion.
   */
  useEffect(() => {
    if (!email && !jeton) return;
    window.history.replaceState(null, "", "/rialto-club/connexion/lien");
  }, [email, jeton]);

  useEffect(() => {
    if (dejaVerifie.current) return;
    dejaVerifie.current = true;

    if (!email || !jeton) {
      setEtat({ phase: "invalide" });
      return;
    }

    (async () => {
      try {
        const res = await fetch(
          `/api/rialto/session/comptes?e=${encodeURIComponent(email)}&c=${encodeURIComponent(jeton)}`,
        );
        const corps = (await res.json().catch(() => null)) as {
          ok?: boolean;
          comptes?: Compte[];
          motif?: string;
          error?: string;
        } | null;

        if (res.ok && corps?.ok && corps.comptes?.length) {
          setEtat({ phase: "choix", comptes: corps.comptes });
          return;
        }
        if (corps?.motif === "perime") return setEtat({ phase: "perime" });
        if (corps?.motif === "aucun_compte")
          return setEtat({ phase: "aucun_compte" });
        if (res.status >= 500)
          return setEtat({
            phase: "panne",
            message: "La connexion ne répond pas. Réessayez dans un instant.",
          });
        setEtat({ phase: "invalide" });
      } catch {
        setEtat({
          phase: "panne",
          message: "Pas de réseau. Vérifiez votre connexion et réessayez.",
        });
      }
    })();
    // `essai` est dans les dépendances : c'est lui qui rejoue la
    // vérification quand on clique « Réessayer ».
  }, [email, jeton, essai]);

  /** Redemander un lien — en UN geste, sans retaper l'adresse. */
  const redemander = useCallback(async () => {
    if (envoi || !email) return;
    setEnvoi(true);
    try {
      const res = await fetch("/api/rialto/session/demande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) setEtat({ phase: "renvoye" });
      else
        setEtat({
          phase: "panne",
          message: "L'envoi n'a pas marché. Réessayez dans un instant.",
        });
    } catch {
      setEtat({ phase: "panne", message: "Pas de réseau. Réessayez." });
    } finally {
      setEnvoi(false);
    }
  }, [email, envoi]);

  const choisir = useCallback(
    async (compte: Compte) => {
      if (ouverture) return;
      setOuverture(compte.id);
      try {
        const res = await fetch("/api/rialto/session/ouvrir", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, jeton, customer_id: compte.id }),
        });
        if (res.ok) {
          router.replace("/mes-commandes");
          return;
        }
        const corps = (await res.json().catch(() => null)) as {
          motif?: string;
        } | null;
        if (corps?.motif === "perime") setEtat({ phase: "perime" });
        else
          setEtat({
            phase: "panne",
            message: "La connexion n'a pas abouti. Redemandez un lien.",
          });
      } catch {
        setEtat({ phase: "panne", message: "Pas de réseau. Réessayez." });
      } finally {
        setOuverture(null);
      }
    },
    [email, jeton, ouverture, router],
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6 py-10">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-white p-7 shadow-card">
        <div className="mb-5 font-serif text-2xl text-rialto">Rialto</div>

        {etat.phase === "verification" && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-rialto border-t-transparent" />
            <p className="text-sm text-mute">Vérification de votre lien…</p>
          </div>
        )}

        {etat.phase === "choix" && (
          <>
            <h1 className="font-serif text-xl text-ink">
              {etat.comptes.length > 1
                ? "Quel compte voulez-vous ouvrir ?"
                : "Bienvenue"}
            </h1>
            {etat.comptes.length > 1 && (
              // ⚠️ On DIT pourquoi il y a un choix. Sans cette phrase, le
              // client croit à un bug — il ne sait pas que quelqu'un
              // d'autre chez lui utilise la même adresse.
              <p className="mt-1 text-sm text-mute">
                Plusieurs comptes utilisent cette adresse.
              </p>
            )}
            <ul className="mt-5 space-y-2">
              {etat.comptes.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => void choisir(c)}
                    disabled={ouverture !== null}
                    className="flex w-full items-center justify-between rounded-xl border border-border px-4 py-3.5 text-left transition-colors hover:border-rialto disabled:opacity-50"
                  >
                    <span className="font-medium text-ink">{c.prenom}</span>
                    <span className="text-sm text-mute">{c.telephone}</span>
                  </button>
                </li>
              ))}
            </ul>
            {ouverture && (
              <p aria-live="polite" className="mt-3 text-center text-sm text-mute">
                Ouverture…
              </p>
            )}
          </>
        )}

        {etat.phase === "perime" && (
          <>
            {/* 🔴 LE TEXTE QU'AUGUSTIN A DEMANDÉ EXPLICITEMENT : le client
                doit comprendre qu'il n'a RIEN FAIT DE MAL, et pouvoir en
                redemander un en UN geste. Pas « jeton expiré » : ces deux
                mots ne veulent rien dire pour quelqu'un qui commande une
                pizza. Mots courants, phrases courtes (règle R4). */}
            <h1 className="font-serif text-xl text-ink">
              Ce lien a passé son heure
            </h1>
            <p className="mt-2 text-sm text-mute">
              Les liens de connexion ne marchent que 15 minutes, pour votre
              sécurité. Celui-ci est trop vieux.
            </p>
            <p className="mt-2 text-sm text-mute">
              Vous n&apos;avez rien fait de mal. Il suffit d&apos;en demander
              un nouveau.
            </p>
            <button
              type="button"
              onClick={() => void redemander()}
              disabled={envoi}
              className="mt-5 w-full rounded-xl bg-rialto py-3.5 font-semibold text-white transition-colors hover:bg-rialto-dark disabled:opacity-50"
            >
              {envoi ? "Envoi…" : "M'envoyer un nouveau lien"}
            </button>
          </>
        )}

        {etat.phase === "renvoye" && (
          <>
            <h1 className="font-serif text-xl text-ink">C&apos;est envoyé</h1>
            <p className="mt-2 text-sm text-mute">
              Regardez votre boîte mail. Le nouveau lien marche 15 minutes.
            </p>
            <p className="mt-2 text-sm text-mute">
              Rien ne s&apos;affiche ? Regardez aussi dans les indésirables.
            </p>
          </>
        )}

        {etat.phase === "invalide" && (
          <>
            <h1 className="font-serif text-xl text-ink">
              Ce lien n&apos;est pas lisible
            </h1>
            <p className="mt-2 text-sm text-mute">
              Il a peut-être été coupé en deux par votre messagerie. Copiez
              l&apos;adresse complète, ou demandez-en un nouveau.
            </p>
            <a
              href="/rialto-club/connexion"
              className="mt-5 block w-full rounded-xl bg-rialto py-3.5 text-center font-semibold text-white transition-colors hover:bg-rialto-dark"
            >
              Demander un nouveau lien
            </a>
          </>
        )}

        {etat.phase === "aucun_compte" && (
          <>
            <h1 className="font-serif text-xl text-ink">
              Aucun compte sur cette adresse
            </h1>
            <p className="mt-2 text-sm text-mute">
              Elle n&apos;est plus rattachée à un compte Rialto Club. Vous
              pouvez en créer un, c&apos;est immédiat.
            </p>
            <a
              href="/rialto-club/join"
              className="mt-5 block w-full rounded-xl bg-rialto py-3.5 text-center font-semibold text-white transition-colors hover:bg-rialto-dark"
            >
              Créer ma carte
            </a>
          </>
        )}

        {etat.phase === "panne" && (
          <>
            <h1 className="font-serif text-xl text-ink">Ça ne répond pas</h1>
            <p className="mt-2 text-sm text-mute">{etat.message}</p>
            {/* 🔴 RELANCE EN MÉMOIRE, PAS `location.reload()`.
                Le premier effet nettoie l'URL (`history.replaceState`) pour
                que l'adresse et le jeton ne traînent ni dans l'historique
                ni dans un `Referer`. Conséquence : recharger cette URL
                nettoyée arrivait SANS `e` ni `c` → phase « invalide » →
                l'écran affichait « Ce lien n'est pas lisible, il a
                peut-être été coupé par votre messagerie ». Le site
                accusait la messagerie du client d'un problème qu'il venait
                de créer lui-même, et un jeton encore valide 15 minutes
                devenait inatteignable.
                Le jeton vit toujours dans ce composant : on rejoue l'effet. */}
            <button
              type="button"
              onClick={() => {
                dejaVerifie.current = false;
                setEtat({ phase: "verification" });
                setEssai((n) => n + 1);
              }}
              className="mt-5 w-full rounded-xl bg-rialto py-3.5 font-semibold text-white transition-colors hover:bg-rialto-dark"
            >
              Réessayer
            </button>
            {/* Et une porte de sortie si le réseau ne revient pas : on peut
                toujours redemander un lien, comme sur l'écran « périmé ». */}
            <button
              type="button"
              onClick={() => void redemander()}
              disabled={envoi}
              className="mt-2 w-full rounded-xl border border-border py-3 text-sm font-semibold text-ink disabled:opacity-50"
            >
              {envoi ? "Envoi…" : "M'envoyer un nouveau lien"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
