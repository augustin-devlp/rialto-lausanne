"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

const ELEMENT_ID = "html5qr-scan-region";

/**
 * Scanner de QR code caméra. Porté depuis loyalty-cards (Stampify) :
 * même config html5-qrcode (facingMode "environment", fps 10, qrbox
 * 240x240), garde anti-double-lecture par ref, cleanup au démontage.
 * Seul le style est adapté à la charte Rialto.
 */
export default function QrScanner({ onScan }: { onScan: (value: string) => void }) {
  const hasScanned = useRef(false);
  const onScanRef = useRef(onScan);
  // Garde le ref à jour sans relancer l'effet.
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    hasScanned.current = false;
    const scanner = new Html5Qrcode(ELEMENT_ID);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          if (hasScanned.current) return;
          hasScanned.current = true;
          onScanRef.current(decodedText);
        },
        () => {}, // ignore les erreurs de décodage par frame
      )
      .catch((err) => console.error("Erreur caméra :", err));

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []);

  return (
    <div className="w-full overflow-hidden rounded-2xl border-2 border-rialto/20 bg-ink">
      <div id={ELEMENT_ID} className="w-full [&_video]:rounded-2xl" />
    </div>
  );
}
