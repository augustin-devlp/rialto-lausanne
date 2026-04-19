"use client";

export default function AvisSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <header className="text-center">
        <h2 className="text-3xl font-bold tracking-tight">Avis clients</h2>
        <div className="mt-3 flex items-baseline justify-center gap-2">
          <span className="text-5xl font-black text-rialto">4.2</span>
          <span className="text-sm text-mute">/ 5</span>
        </div>
        <div className="mt-1 text-sm text-mute">660 avis</div>
      </header>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-card">
        <div className="text-3xl">⭐</div>
        <p className="mt-3 text-sm text-mute">
          Les avis clients détaillés seront bientôt disponibles ici.
        </p>
        <a
          href="https://www.google.com/maps/search/Rialto+Lausanne"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-rialto px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-rialto-dark"
        >
          Lire les avis Google
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
          </svg>
        </a>
      </div>
    </section>
  );
}
