"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SuggestionAdresse } from "@/lib/geoadmin";

/**
 * Champ « rue et numéro » avec autocomplétion GeoAdmin.
 *
 * 🔴 RÈGLE D'AUGUSTIN, 22.08.2026 : **L'AUTOCOMPLÉTION EST UN CONFORT DE
 * SAISIE, JAMAIS UNE SOURCE DE VÉRITÉ.** Ce composant remplit deux champs
 * de texte. Il ne qualifie aucune zone, ne calcule aucun frais, ne promet
 * aucun minimum. La zone se qualifie sur le NPA, côté serveur.
 *
 * 🔴 ET SA CONSÉQUENCE VISIBLE : **le client doit pouvoir passer outre.**
 * Une adresse que l'API ne connaît pas — immeuble neuf, graphie
 * inhabituelle, faute de frappe volontaire — ne bloque JAMAIS. La saisie
 * reste libre à tout instant, la liste n'est qu'une aide qu'on peut
 * ignorer, fermer avec `Échap`, ou ne jamais ouvrir. Aucun `readOnly`,
 * aucune validation « choisissez dans la liste ».
 *
 * ⚠️ CE QU'IL NE FAIT PAS NON PLUS : il n'écrit pas le NPA tout seul si le
 * client en a déjà mis un. On ne réécrit pas par-dessus ce que quelqu'un a
 * tapé — sauf quand il choisit explicitement une ligne de la liste, ce qui
 * EST le geste par lequel il nous demande de remplir.
 */

interface Props {
  /** Valeur du champ rue (contrôlé par le parent). */
  valeur: string;
  onChangeValeur: (v: string) => void;
  /** Appelé quand le client CHOISIT une ligne. Le parent remplit le NPA. */
  onChoisir?: (s: SuggestionAdresse) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  autoFocus?: boolean;
  /** Ajouté à la recherche pour la resserrer (ex. « Lausanne »). */
  contexte?: string;
}

const DEBOUNCE_MS = 250;

export default function AutocompleteAdresse({
  valeur,
  onChangeValeur,
  onChoisir,
  placeholder = "Votre rue et numéro",
  className,
  id,
  autoFocus,
  contexte = "Lausanne",
}: Props) {
  const idListe = useId();
  const [suggestions, setSuggestions] = useState<SuggestionAdresse[]>([]);
  const [ouvert, setOuvert] = useState(false);
  const [surligne, setSurligne] = useState(-1);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abort = useRef<AbortController | null>(null);
  /** Ce que le client vient de choisir : on ne re-cherche pas dessus. */
  const dernierChoix = useRef<string | null>(null);
  const conteneur = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const q = valeur.trim();
    if (dernierChoix.current === q) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (abort.current) abort.current.abort();

    if (q.length < 3) {
      setSuggestions([]);
      setOuvert(false);
      return;
    }

    debounce.current = setTimeout(async () => {
      const ac = new AbortController();
      abort.current = ac;
      try {
        const res = await fetch(
          `/api/rialto/adresses?q=${encodeURIComponent(`${q} ${contexte}`.trim())}`,
          { signal: ac.signal },
        );
        const corps = (await res.json().catch(() => null)) as {
          suggestions?: SuggestionAdresse[];
        } | null;
        // ⚠️ Si le run courant a changé entre-temps, on ne touche à rien —
        // même piège que le panneau d'upsell : un `finally` ou un `set`
        // d'un run avorté écrase l'état du run suivant.
        if (abort.current !== ac) return;
        const liste = corps?.suggestions ?? [];
        setSuggestions(liste);
        setOuvert(liste.length > 0);
        setSurligne(-1);
      } catch {
        // ⚠️ SILENCE VOULU. L'autocomplétion qui ne répond pas ne doit rien
        // afficher du tout : le champ reste utilisable, le client tape son
        // adresse à la main, la commande passe. Un message d'erreur ici
        // ferait croire à un problème qui n'en est pas un.
        if (abort.current === ac) {
          setSuggestions([]);
          setOuvert(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [valeur, contexte]);

  // Fermeture au clic dehors.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const choisir = useCallback(
    (s: SuggestionAdresse) => {
      dernierChoix.current = s.rue;
      onChangeValeur(s.rue);
      onChoisir?.(s);
      setOuvert(false);
      setSuggestions([]);
    },
    [onChangeValeur, onChoisir],
  );

  return (
    <div ref={conteneur} className="relative">
      <input
        id={id}
        type="text"
        value={valeur}
        onChange={(e) => {
          dernierChoix.current = null;
          onChangeValeur(e.target.value);
        }}
        onFocus={() => suggestions.length > 0 && setOuvert(true)}
        onKeyDown={(e) => {
          if (!ouvert || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSurligne((i) => (i + 1) % suggestions.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSurligne((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
          } else if (e.key === "Enter" && surligne >= 0) {
            // ⚠️ On n'intercepte Entrée QUE si une ligne est surlignée.
            // Sinon on volerait la soumission du formulaire à quelqu'un qui
            // a tapé son adresse à la main et veut simplement valider.
            e.preventDefault();
            choisir(suggestions[surligne]);
          } else if (e.key === "Escape") {
            setOuvert(false);
          }
        }}
        placeholder={placeholder}
        className={className}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={ouvert}
        aria-controls={idListe}
        aria-autocomplete="list"
        aria-activedescendant={
          surligne >= 0 ? `${idListe}-${surligne}` : undefined
        }
      />

      {ouvert && suggestions.length > 0 && (
        <ul
          id={idListe}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.libelle}
              id={`${idListe}-${i}`}
              role="option"
              aria-selected={i === surligne}
            >
              <button
                type="button"
                // `onMouseDown` et pas `onClick` : le `blur` du champ part
                // avant le clic et refermerait la liste sous le doigt.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choisir(s);
                }}
                onMouseEnter={() => setSurligne(i)}
                className={`block w-full px-4 py-2.5 text-left text-sm ${
                  i === surligne ? "bg-cream text-ink" : "text-ink"
                }`}
              >
                <span className="font-medium">{s.rue}</span>
                <span className="ml-2 text-mute">
                  {s.npa} {s.ville}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠️ La phrase qui dit que la liste n'oblige à rien. Sans elle, un
          client dont l'adresse n'apparaît pas croit qu'il ne peut pas
          commander — c'est exactement le cas ④ des pièges. */}
      {ouvert && (
        <p className="sr-only" aria-live="polite">
          {suggestions.length} adresse(s) proposée(s). Vous pouvez aussi
          écrire la vôtre librement.
        </p>
      )}
    </div>
  );
}
