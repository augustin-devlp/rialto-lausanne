"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SiteFooter from "@/components/home/SiteFooter";
import { STAMPIFY_BASE } from "@/lib/stampifyConfig";
import { normalizePhone } from "@/lib/phone";
import {
  readCustomerSession,
  writeCustomerSession,
} from "@/lib/customerSession";

export default function JoinClient() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Si déjà connecté → redirect vers la carte
  useEffect(() => {
    const s = readCustomerSession();
    if (s) {
      router.replace(`/c/${s.short_code}`);
    }
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const cleanPhone = normalizePhone(phone);
      if (!cleanPhone) {
        setError("Numéro invalide. Format : +41 79…, +33 6…");
        setLoading(false);
        return;
      }
      const res = await fetch(`${STAMPIFY_BASE}/api/rialto/loyalty/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim() || null,
          phone: cleanPhone,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Erreur serveur");
        setLoading(false);
        return;
      }
      const body = (await res.json()) as {
        customer: { id: string };
        card: { short_code: string | null };
        sms_sent?: boolean;
      };
      if (!body.card.short_code) {
        setError(
          "Carte créée mais code manquant. Rechargez la page.",
        );
        setLoading(false);
        return;
      }
      writeCustomerSession({
        customer_id: body.customer.id,
        short_code: body.card.short_code,
        phone: cleanPhone,
        first_name: firstName.trim(),
      });
      // Phase 10 C2D : signale au destination page si le SMS a échoué,
      // pour qu'elle affiche un fallback "copie ce lien en favori".
      const smsFlag = body.sms_sent === false ? "?sms=ko" : "";
      router.push(`/c/${body.card.short_code}${smsFlag}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur réseau");
      setLoading(false);
    }
  }

  return (
    <>
      <main className="min-h-screen bg-cream pb-16 pt-20 md:pt-24">
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
                Rejoins le club{" "}
                <em className="italic text-rialto">en 30 sec.</em>
              </h1>
              <p className="mt-3 text-base text-mute">
                1 tampon offert à chaque commande. À 10 tampons, une pizza Ø33 cm
                à ton choix. Aucun abonnement, aucun engagement.
              </p>
            </header>

            {/* Bénéfices */}
            <ul className="mb-6 space-y-2.5 rounded-3xl border border-border bg-white p-6 text-sm">
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
                  ✓
                </span>
                <span>
                  <strong>1 pizza offerte</strong> tous les 10 tampons
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
                  ✓
                </span>
                <span>
                  <strong>Roue de la chance</strong> mensuelle (boissons,
                  desserts, réductions)
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
                  ✓
                </span>
                <span>
                  <strong>Offre anniversaire</strong> envoyée par SMS
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rialto/10 text-rialto">
                  ✓
                </span>
                <span>
                  <strong>QR code sur ton mobile</strong>, pas de carte plastique
                </span>
              </li>
            </ul>

            {/* Formulaire */}
            <form
              onSubmit={handleSubmit}
              className="space-y-4 rounded-3xl bg-white p-6 shadow-card"
            >
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">
                  Prénom <span className="text-rialto">*</span>
                </span>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="input"
                  placeholder="Augustin"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">
                  Nom
                </span>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className="input"
                  placeholder="Facultatif"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">
                  Téléphone <span className="text-rialto">*</span>
                </span>
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  className="input"
                  placeholder="+41 79 123 45 67"
                />
                <p className="mt-1 text-xs text-mute">
                  Tu recevras un SMS avec le lien vers ta carte + son QR code.
                </p>
              </label>

              {error && (
                <div className="rounded-xl border border-rialto/30 bg-rialto/10 p-3 text-sm text-rialto">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !firstName.trim() || !phone.trim()}
                className="btn-primary-lg w-full"
              >
                {loading ? "Création…" : "🎴 Créer ma carte"}
              </button>
              <p className="text-center text-[11px] text-mute">
                Gratuit · aucun abonnement · tu peux te désinscrire à tout
                moment en nous contactant.
              </p>
            </form>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
