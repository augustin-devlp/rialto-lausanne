"use client";

const ADDRESS = "Avenue de Béthusy 29B, 1012 Lausanne";
const PHONE = "+41 21 312 64 60";
const MAPS_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  "Rialto Lausanne " + ADDRESS,
)}`;
const MAPS_EMBED = `https://www.google.com/maps?q=${encodeURIComponent(
  ADDRESS,
)}&output=embed`;

export default function ContactSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12">
      <header className="text-center">
        <h2 className="text-3xl font-bold tracking-tight">Nous trouver</h2>
        <p className="mt-2 text-sm text-mute">
          Pizzeria & brasserie · Lausanne
        </p>
      </header>

      <div className="mt-8 grid gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <InfoRow
          icon="📍"
          label="Adresse"
          value={ADDRESS}
          href={MAPS_URL}
          external
        />
        <InfoRow
          icon="📞"
          label="Téléphone"
          value={PHONE}
          href={`tel:${PHONE.replace(/\s/g, "")}`}
        />
        <InfoRow
          icon="🕐"
          label="Horaires"
          value="Ouvert 7j/7 · 11h00 – 22h30"
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 shadow-card">
        <iframe
          src={MAPS_EMBED}
          width="100%"
          height="400"
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title="Rialto Lausanne sur Google Maps"
        />
      </div>
    </section>
  );
}

function InfoRow({
  icon,
  label,
  value,
  href,
  external,
}: {
  icon: string;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-3">
      <span className="text-xl">{icon}</span>
      <div className="flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-mute">
          {label}
        </div>
        <div className="text-sm font-medium text-ink">{value}</div>
      </div>
      {href && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="h-4 w-4 self-center text-mute"
        >
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      )}
    </div>
  );
  if (!href) return content;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
      className="-mx-2 rounded-xl px-2 py-2 transition hover:bg-surface"
    >
      {content}
    </a>
  );
}
