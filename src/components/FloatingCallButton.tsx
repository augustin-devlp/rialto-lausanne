"use client";

type Props = { phone: string | null };

/**
 * Bouton flottant bottom-right pour appeler Rialto.
 * Affiché en permanence sur le site.
 */
export default function FloatingCallButton({ phone }: Props) {
  if (!phone) return null;
  const cleanPhone = phone.replace(/\s/g, "");
  return (
    <a
      href={`tel:${cleanPhone}`}
      aria-label="Appeler Rialto"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 5.5rem)",
      }}
      className="fixed right-4 z-20 inline-flex items-center gap-2 rounded-full border border-rialto bg-white px-4 py-3 text-sm font-semibold text-rialto shadow-pop transition active:scale-[0.97] hover:bg-rialto hover:text-white lg:bottom-6"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </svg>
      <span className="hidden sm:inline">Appeler Rialto</span>
    </a>
  );
}
