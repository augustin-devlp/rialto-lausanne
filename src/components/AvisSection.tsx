"use client";

const RATING = 4.7;
const REVIEWS_COUNT = "230+";

function Star() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="#E30613"
      stroke="#E30613"
      strokeWidth={2}
      strokeLinejoin="round"
      className="h-8 w-8 sm:h-10 sm:w-10"
      aria-hidden
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export default function AvisSection() {
  return (
    <section className="mx-auto max-w-xl px-4 py-12">
      <header className="text-center">
        <h2 className="text-3xl font-bold tracking-tight">Nos avis clients</h2>
      </header>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
        <div className="text-center">
          <div
            className="text-rialto"
            style={{
              fontFamily:
                "'Fraunces', 'Playfair Display', Georgia, serif",
              fontSize: "clamp(64px, 14vw, 80px)",
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: "-0.03em",
            }}
          >
            {RATING.toFixed(1)}
            <span className="ml-1 text-3xl text-mute">/5</span>
          </div>

          <div className="mt-4 flex justify-center gap-1">
            <Star />
            <Star />
            <Star />
            <Star />
            <Star />
          </div>

          <p className="mt-4 text-sm text-mute">
            Basé sur <strong className="text-ink">{REVIEWS_COUNT} avis</strong>{" "}
            de clients satisfaits.
          </p>

          <p className="mt-4 rounded-xl bg-surface p-4 text-xs text-mute">
            Commandez en direct sans intermédiaire — livraison maison par{" "}
            <strong className="text-ink">Rialto</strong>.
          </p>
        </div>
      </div>
    </section>
  );
}
