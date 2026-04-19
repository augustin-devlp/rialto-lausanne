"use client";

const RATING = 4.7;
const REVIEWS_COUNT = "230+";
const JUSTEAT_URL = "https://www.just-eat.ch/fr/menu/rialto-1";

function Star({ filled = true }: { filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "#E30613" : "none"}
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
            Just Eat.
          </p>

          <a
            href={JUSTEAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-rialto px-5 py-3 text-sm font-semibold text-white transition hover:bg-rialto-dark"
          >
            Voir tous les avis sur Just Eat
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M7 17 17 7" />
              <path d="M7 7h10v10" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
