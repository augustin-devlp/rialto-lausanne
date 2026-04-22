"use client";

/**
 * Page publique /c/[shortCode] sur le site Rialto — affichage carte
 * fidélité avec QR code. Design cohérent avec le reste du site
 * (terracotta + crème + Fraunces).
 *
 * Remplace l'ancienne route /c/ côté stampify.ch pour une meilleure
 * cohérence de marque (FIX 3 phase 5).
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import SiteFooter from "@/components/home/SiteFooter";
import { RIALTO_INFO } from "@/lib/rialto-data";

type Card = {
  id: string;
  short_code: string;
  current_stamps: number;
  stamps_required: number;
  reward_description: string;
  card_name: string;
  qr_code_value: string;
  first_name: string;
  phone_masked: string;
};

export default function LoyaltyCardView({ card }: { card: Card }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloadUrl, setDownloadUrl] = useState<string>("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(
      canvas,
      card.qr_code_value,
      {
        width: 300,
        margin: 1,
        color: { dark: "#1A1A1A", light: "#FFFFFF" },
        errorCorrectionLevel: "M",
      },
      (err) => {
        if (err) console.error("[qr-render] failed", err);
        else {
          canvas.toBlob((blob) => {
            if (blob) setDownloadUrl(URL.createObjectURL(blob));
          });
        }
      },
    );
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.qr_code_value]);

  const total = card.stamps_required;
  const filled = Math.min(card.current_stamps, total);
  const remaining = Math.max(0, total - filled);
  const progressPct = Math.round((filled / total) * 100);
  const isComplete = remaining === 0;

  return (
    <>
      <main className="min-h-[100dvh] bg-cream pb-16">
        <div className="mx-auto max-w-md px-4 pt-6">
          {/* Header */}
          <header className="flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 text-ink">
              <svg width="36" height="36" viewBox="0 0 32 32" aria-hidden>
                <circle cx="16" cy="16" r="15" fill="#C73E1D" />
                <text
                  x="50%"
                  y="55%"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontFamily="var(--font-fraunces), Georgia, serif"
                  fontSize="18"
                  fontWeight="700"
                  fill="#F9F1E4"
                >
                  R
                </text>
              </svg>
              <div>
                <div className="font-display text-xl font-bold leading-tight">
                  Rialto
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-rialto">
                  Rialto Club
                </div>
              </div>
            </Link>
            <span className="rounded-full border border-border bg-white px-2.5 py-1 font-mono text-[10px] font-semibold text-mute">
              #{card.short_code}
            </span>
          </header>

          {/* Card principale terracotta */}
          <section className="mt-6 overflow-hidden rounded-3xl bg-gradient-to-br from-rialto to-rialto-dark text-white shadow-[0_20px_50px_-10px_rgba(199,62,29,0.35)]">
            <div className="p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-saffron">
                    Bonjour
                  </div>
                  <div className="mt-1 font-display text-2xl font-bold leading-tight">
                    {card.first_name || "Client"}
                  </div>
                  {card.phone_masked && (
                    <div className="mt-0.5 font-mono text-[10px] text-white/60">
                      {card.phone_masked}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                    Tampons
                  </div>
                  <div className="font-display text-4xl font-bold">
                    {filled}
                    <span className="text-xl text-white/60">/{total}</span>
                  </div>
                </div>
              </div>

              {/* Barre de progression avec stamps visuels */}
              <div className="mt-5 flex gap-1">
                {Array.from({ length: total }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                      i < filled ? "bg-saffron" : "bg-white/15"
                    }`}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-white/75">
                <span>0</span>
                <span>{progressPct}%</span>
                <span>{total}</span>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-white/90">
                {isComplete ? (
                  <>
                    🎉 <strong>Carte complète !</strong> Montrez-la pour obtenir{" "}
                    <strong>{card.reward_description.toLowerCase()}</strong>.
                  </>
                ) : (
                  <>
                    Encore <strong>{remaining}</strong>{" "}
                    {remaining === 1 ? "tampon" : "tampons"} pour{" "}
                    <strong>{card.reward_description.toLowerCase()}</strong>.
                  </>
                )}
              </p>
            </div>
          </section>

          {/* QR code */}
          <section className="mt-5 rounded-3xl bg-white p-6 shadow-card">
            <div className="mb-4 text-center">
              <h2 className="font-display text-lg font-bold">
                Montrez ce QR code
              </h2>
              <p className="mt-0.5 text-xs text-mute">
                Le restaurant scanne = 1 tampon ajouté
              </p>
            </div>

            <div className="flex justify-center">
              <div className="rounded-2xl border-2 border-border bg-white p-3">
                <canvas
                  ref={canvasRef}
                  className="block"
                  aria-label="QR code carte fidélité"
                />
              </div>
            </div>

            {downloadUrl && (
              <a
                href={downloadUrl}
                download={`rialto-fidelite-${card.short_code}.png`}
                className="btn-ghost mt-4 w-full"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Télécharger le QR code
              </a>
            )}

            {/* Placeholder Apple Wallet / Google Wallet — à activer plus tard */}
            <button
              type="button"
              disabled
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full border border-border bg-cream-dark px-5 py-2.5 text-xs font-medium text-mute"
              title="Bientôt disponible"
            >

              Ajouter à Apple Wallet{" "}
              <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                Bientôt
              </span>
            </button>
          </section>

          {/* Comment ça marche */}
          <section className="mt-5 rounded-2xl border border-border bg-white p-5 text-sm">
            <div className="flex items-start gap-3">
              <div className="shrink-0 text-xl">💡</div>
              <div>
                <div className="font-display font-semibold">
                  Comment ça marche ?
                </div>
                <ol className="mt-2 space-y-1.5 text-xs text-mute">
                  <li>
                    <span className="font-semibold text-ink">1.</span>{" "}
                    Commande en ligne ou au comptoir
                  </li>
                  <li>
                    <span className="font-semibold text-ink">2.</span> Montre
                    ton QR code à Rialto
                  </li>
                  <li>
                    <span className="font-semibold text-ink">3.</span> 1 tampon
                    ajouté à chaque commande
                  </li>
                  <li>
                    <span className="font-semibold text-ink">4.</span> À {total}{" "}
                    tampons :{" "}
                    <strong className="text-rialto">
                      {card.reward_description.toLowerCase()}
                    </strong>
                  </li>
                </ol>
              </div>
            </div>
          </section>

          {/* Hint "Ajouter à l'écran d'accueil" */}
          <section className="mt-5 rounded-2xl bg-ink p-5 text-white">
            <div className="flex items-start gap-3">
              <div className="shrink-0 text-xl">📱</div>
              <div>
                <div className="font-display font-semibold">
                  Garde ta carte à portée de main
                </div>
                <p className="mt-1 text-xs text-white/75">
                  Ajoute cette page à ton écran d&apos;accueil. Sur iPhone :
                  bouton{" "}
                  <svg
                    className="inline h-3 w-3 align-middle"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                    <polyline points="16 6 12 2 8 6" />
                    <line x1="12" y1="2" x2="12" y2="15" />
                  </svg>{" "}
                  Partager → &quot;Sur l&apos;écran d&apos;accueil&quot;.
                </p>
              </div>
            </div>
          </section>

          {/* Retour accueil */}
          <section className="mt-6 text-center">
            <Link href="/menu" className="btn-primary">
              Commander maintenant
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
          </section>

          <p className="mt-6 text-center text-[10px] text-mute">
            {RIALTO_INFO.address}
            <br />
            <a
              href={`tel:${RIALTO_INFO.phoneTel}`}
              className="hover:text-ink"
            >
              {RIALTO_INFO.phoneDisplay}
            </a>
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
