"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

type Props = {
  orderNumber: string;
  /** URL absolue complète qui sera encodée dans le QR. */
  scanUrl: string;
};

/**
 * QR code de retrait affiché sur /order/[id] quand status === "ready".
 * Le client le présente en caisse, Mehmet le scanne → passe la commande en
 * "completed" automatiquement.
 */
export default function QRPickup({ orderNumber, scanUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(
      canvasRef.current,
      scanUrl,
      {
        width: 256,
        margin: 1,
        color: { dark: "#1a1a1a", light: "#ffffff" },
      },
      (err) => {
        if (err) console.error("[qr] failed", err);
      },
    );
  }, [scanUrl]);

  return (
    <div className="mt-6 flex flex-col items-center rounded-2xl border-2 border-emerald-500 bg-emerald-50 p-6 shadow-card">
      <div className="text-xs font-bold uppercase tracking-wider text-emerald-700">
        🎉 Votre commande est prête !
      </div>
      <div className="mt-1 text-lg font-black text-emerald-900">
        {orderNumber}
      </div>
      <canvas
        ref={canvasRef}
        className="mt-4 rounded-lg bg-white p-3"
        style={{ width: 256, height: 256 }}
      />
      <p className="mt-4 text-center text-sm text-emerald-900">
        <strong>Présentez ce QR code en caisse.</strong>
        <br />
        Paiement sur place (espèces ou TWINT).
      </p>
    </div>
  );
}
