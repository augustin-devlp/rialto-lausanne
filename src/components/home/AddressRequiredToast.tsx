"use client";

/**
 * Toast affiché sur la homepage quand l'utilisateur a été redirigé vers /
 * depuis /menu ou /checkout sans adresse qualifiée en localStorage.
 *
 * Lit ?need_address=1 ou ?reason=address_required dans les searchParams.
 * Auto-scroll vers la section hero (AddressGate) + focus sur l'input.
 */

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Toast from "@/components/ui/Toast";

export default function AddressRequiredToast() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const firedRef = useRef(false);

  useEffect(() => {
    const hasParam =
      searchParams.get("need_address") === "1" ||
      searchParams.get("reason") === "address_required";

    if (!hasParam || firedRef.current) return;
    firedRef.current = true;

    setOpen(true);

    // Scroll doux vers l'input adresse + focus
    // L'AddressGate est dans le Hero donc un simple scrollTo(0,0) suffit
    // pour que l'utilisateur voie le formulaire. On cherche aussi à
    // focuser le premier input de saisie pour mobile.
    setTimeout(() => {
      const input = document.querySelector<HTMLInputElement>(
        "[data-address-input]",
      );
      if (input) {
        input.scrollIntoView({ behavior: "smooth", block: "center" });
        // Focus avec léger délai pour laisser le scroll finir
        setTimeout(() => input.focus({ preventScroll: true }), 400);
      }
    }, 150);

    // Clean le query param de l'URL sans recharger
    const params = new URLSearchParams(searchParams.toString());
    params.delete("need_address");
    params.delete("reason");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  return (
    <Toast
      open={open}
      variant="warning"
      icon="📍"
      message="Veuillez saisir votre adresse pour accéder au menu et commander."
      autoCloseMs={6000}
      onClose={() => setOpen(false)}
    />
  );
}
