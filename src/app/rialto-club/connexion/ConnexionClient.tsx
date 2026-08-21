"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/home/SiteFooter";
import { normalizePhone } from "@/lib/phone";
import {
  readCustomerSession,
  writeCustomerSession,
} from "@/lib/customerSession";

type LoginResponse =
  | {
      ok: true;
      short_code: string;
      customer_id: string | null;
      first_name: string;
      card_id: string;
    }
  | {
      ok: false;
      reason: "not_found" | "rate_limited" | "invalid_phone" | "short_code_missing";
    };

export default function ConnexionClient() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  // Voie e-mail (22.08.2026) — la connexion qui PROUVE quelque chose.
  const [emailLien, setEmailLien] = useState("");
  const [envoiLien, setEnvoiLien] = useState(false);
  const [lienEnvoye, setLienEnvoye] = useState(false);
  const [erreurLien, setErreurLien] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Si déjà connecté → redirect direct vers la carte
  useEffect(() => {
    const s = readCustomerSession();
    if (s) {
      router.replace(`/c/${s.short_code}`);
    }
  }, [router]);

  /**
   * Demande d'un lien de connexion par e-mail.
   * ⚠️ La réponse de la route est LA MÊME que l'adresse existe ou non —
   * cet écran ne doit donc rien dire de plus qu'elle. Afficher « compte
   * introuvable » ici annulerait la garde côté serveur.
   */
  async function demandeLien(e: React.FormEvent) {
    e.preventDefault();
    if (envoiLien) return;
    setEnvoiLien(true);
    setErreurLien(null);
    try {
      const res = await fetch("/api/rialto/session/demande", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailLien }),
      });
      if (res.ok) {
        setLienEnvoye(true);
        return;
      }
      if (res.status === 400) {
        setErreurLien("Cette adresse n'est pas complète.");
        return;
      }
      setErreurLien("L'envoi n'a pas marché. Réessayez dans un instant.");
    } catch {
      setErreurLien("Pas de réseau. Vérifiez votre connexion.");
    } finally {
      setEnvoiLien(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    setNotFound(false);

    try {
      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone) {
        setError("Numéro invalide. Format : +41 79…, +33 6…");
        setLoading(false);
        return;
      }

      const res = await fetch(
        `/api/loyalty-cards/login-by-phone`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phone: cleanPhone }),
        },
      );
      if (res.status === 429) {
        setError(
          "Trop de tentatives. Patiente 1 minute avant de réessayer.",
        );
        setLoading(false);
        return;
      }

      const body = (await res.json()) as LoginResponse;

      if (!body.ok) {
        if (body.reason === "not_found") {
          setNotFound(true);
        } else if (body.reason === "invalid_phone") {
          setError("Numéro invalide.");
        } else {
          setError("Erreur serveur. Réessaye plus tard.");
        }
        setLoading(false);
        return;
      }

      // Success : stocke la session + redirige avec ?welcome=1
      writeCustomerSession({
        customer_id: body.customer_id ?? "",
        short_code: body.short_code,
        phone: cleanPhone,
        first_name: body.first_name,
      });

      router.push(`/c/${body.short_code}?welcome=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
      setLoading(false);
    }
  }

  return (
    <>
      <main className="min-h-screen bg-white pb-16 pt-8">
        <div className="container-hero">
          <div className="mx-auto max-w-lg">
            <Link
              href="/"
              className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-mute hover:text-ink"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Retour
            </Link>

            <header className="mb-8">
              <span className="eyebrow">Rialto Club</span>
              <h1 className="mt-3 font-display text-h1 font-bold leading-tight">
                Se connecter{" "}
                <em className="italic text-rialto">à votre compte.</em>
              </h1>
              <p className="mt-3 text-base text-mute">
                Entrez votre numéro de téléphone pour retrouver votre carte
                fidélité et vos tampons accumulés.
              </p>
            </header>

            {/* Formulaire */}
            <form
              onSubmit={handleSubmit}
              className="space-y-4 rounded-3xl bg-white p-6 shadow-card"
            >
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">
                  Téléphone <span className="text-rialto">*</span>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    setNotFound(false);
                    setError(null);
                  }}
                  autoComplete="tel"
                  className="input"
                  placeholder="+41 79 123 45 67"
                />
                <p className="mt-1 text-xs text-mute">
                  Utilisez le numéro avec lequel vous avez créé votre carte.
                </p>
              </label>

              {error && (
                <div className="rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto">
                  {error}
                </div>
              )}

              {notFound && (
                <div className="rounded-xl border border-saffron bg-[#FFF2D1] p-4 text-sm">
                  <div className="font-semibold text-[#8F4A00]">
                    Aucune carte trouvée avec ce numéro.
                  </div>
                  <p className="mt-1 text-[#8F4A00]/80">
                    Vérifiez le numéro ou créez votre carte maintenant.
                  </p>
                  <Link
                    href="/rialto-club/join"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-rialto hover:text-rialto-dark"
                  >
                    Créer ma carte
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </Link>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !phone.trim()}
                className="btn-primary-lg w-full"
              >
                {loading ? "Recherche…" : "🔑 Retrouver ma carte"}
              </button>

              <div className="flex items-center gap-3 pt-2 text-[11px] text-mute">
                <div className="h-px flex-1 bg-border" />
                <span>OU</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <Link
                href="/rialto-club/join"
                className="flex items-center justify-center gap-1.5 rounded-full border border-border bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink"
              >
                Pas encore de carte ? Créer ma carte
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </form>

            {/* 🔴 LA VOIE E-MAIL (Augustin, 22.08.2026) — c'est la seule des
                deux qui PROUVE quelque chose. Le numéro de téléphone n'est
                pas un secret : c'est un identifiant, et quiconque le
                connaît ouvrait le compte. Le lien e-mail prouve la
                possession d'une boîte.
                ⚠️ La voie téléphone est CONSERVÉE pour ne déconnecter
                personne du jour au lendemain. Elle a vocation à disparaître :
                c'est elle, le trou. */}
            <div className="mt-6 border-t border-border pt-5">
              {lienEnvoye ? (
                <div aria-live="polite">
                  <p className="text-sm font-semibold text-ink">
                    C&apos;est envoyé.
                  </p>
                  {/* ⚠️ MÊME PHRASE QUE LA ROUTE, au conditionnel : elle ne
                      dit pas si le compte existe. Le dire ici annulerait la
                      garde du serveur. */}
                  <p className="mt-1 text-sm text-mute">
                    Si un compte existe avec cette adresse, le lien vient de
                    partir. Regardez votre boîte mail — il marche 15 minutes.
                  </p>
                  <p className="mt-1 text-sm text-mute">
                    Rien ne s&apos;affiche ? Regardez aussi dans les
                    indésirables.
                  </p>
                </div>
              ) : (
                <form onSubmit={demandeLien} className="space-y-3">
                  <label
                    htmlFor="connexion-email"
                    className="block text-sm font-semibold text-ink"
                  >
                    Recevoir un lien par email
                  </label>
                  <p className="text-[11px] text-mute">
                    Plus sûr : personne ne peut ouvrir votre compte sans
                    accéder à votre boîte mail.
                  </p>
                  <input
                    id="connexion-email"
                    type="email"
                    autoComplete="email"
                    placeholder="prenom@exemple.ch"
                    value={emailLien}
                    onChange={(ev) => setEmailLien(ev.target.value)}
                    className="w-full rounded-xl border border-border px-4 py-3 text-base focus:border-rialto focus:outline-none"
                  />
                  {erreurLien && (
                    <p role="alert" className="text-sm text-rialto">
                      {erreurLien}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={envoiLien || !emailLien.trim()}
                    className="w-full rounded-full border border-ink bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:bg-cream disabled:opacity-50"
                  >
                    {envoiLien ? "Envoi…" : "M'envoyer un lien"}
                  </button>
                </form>
              )}
            </div>

            {/* ⚠️ CETTE PHRASE DISAIT : « Pas de mot de passe à retenir.
                Votre numéro de téléphone suffit. » Elle décrivait exactement
                le problème — et elle le VENDAIT comme un avantage.
                Retirée le 22.08 avec l'arrivée du lien e-mail. */}
            <p className="mt-4 text-center text-[11px] text-mute">
              Pas de mot de passe à retenir.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
