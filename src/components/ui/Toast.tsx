"use client";

/**
 * Toast réutilisable — overlay fixed top, auto-dismiss.
 *
 * Variantes :
 *   - info     : bleu
 *   - success  : vert
 *   - warning  : safran (attire l'attention)
 *   - error    : terracotta
 *
 * Usage simple via composant contrôlé, mais on expose aussi un helper
 * imperatif `showToast(...)` pour les cas one-shot.
 */

import { useEffect, useState } from "react";

export type ToastVariant = "info" | "success" | "warning" | "error";

type ToastProps = {
  open: boolean;
  variant?: ToastVariant;
  icon?: React.ReactNode;
  message: React.ReactNode;
  autoCloseMs?: number;
  onClose: () => void;
};

const VARIANTS: Record<ToastVariant, { bg: string; border: string; icon: string }> = {
  info: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    icon: "text-blue-700",
  },
  success: {
    bg: "bg-emerald-50",
    border: "border-emerald-300",
    icon: "text-emerald-700",
  },
  warning: {
    bg: "bg-[#FFF2D1]",
    border: "border-saffron",
    icon: "text-[#8F4A00]",
  },
  error: {
    bg: "bg-rialto/10",
    border: "border-rialto",
    icon: "text-rialto",
  },
};

export default function Toast({
  open,
  variant = "info",
  icon,
  message,
  autoCloseMs = 5000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (!open || autoCloseMs <= 0) return;
    const id = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(id);
  }, [open, autoCloseMs, onClose]);

  if (!open) return null;
  const v = VARIANTS[variant];

  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[110] flex justify-center px-4 md:top-20">
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border-2 px-4 py-3 shadow-pop backdrop-blur-lg animate-fade-up ${v.bg} ${v.border}`}
      >
        {icon && (
          <div className={`shrink-0 text-xl leading-none ${v.icon}`}>
            {icon}
          </div>
        )}
        <div className="flex-1 text-sm font-medium text-ink">{message}</div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 text-ink/40 hover:text-ink"
          aria-label="Fermer"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <line x1="6" y1="6" x2="18" y2="18" />
            <line x1="6" y1="18" x2="18" y2="6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/**
 * Hook utilitaire pour un toast contrôlé facile à utiliser.
 * Exemple :
 *   const toast = useToast();
 *   toast.show({ variant: "warning", message: "..." });
 */
export function useToast() {
  const [state, setState] = useState<
    | {
        open: boolean;
        variant: ToastVariant;
        icon?: React.ReactNode;
        message: React.ReactNode;
        autoCloseMs?: number;
      }
    | null
  >(null);

  return {
    state,
    show: (opts: {
      variant?: ToastVariant;
      icon?: React.ReactNode;
      message: React.ReactNode;
      autoCloseMs?: number;
    }) =>
      setState({
        open: true,
        variant: opts.variant ?? "info",
        icon: opts.icon,
        message: opts.message,
        autoCloseMs: opts.autoCloseMs,
      }),
    hide: () => setState((s) => (s ? { ...s, open: false } : null)),
  };
}
