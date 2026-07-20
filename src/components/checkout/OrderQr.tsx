"use client";

/**
 * QR code de la commande — affiché sur /confirmation/[orderNumber].
 * Encode l'order_number en clair (ex. "R-2026-042") : le dashboard
 * restaurateur le scanne pour retrouver la commande en une seconde
 * (retrait au comptoir, contrôle à la livraison).
 */

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

export default function OrderQr({ orderNumber }: { orderNumber: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, orderNumber, {
      width: 160,
      margin: 1,
      color: { dark: "#1A1A1A", light: "#FFFFFF" },
    }).catch((err) => console.error("[order-qr] render failed", err));
  }, [orderNumber]);

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-card">
      <canvas
        ref={canvasRef}
        className="h-[92px] w-[92px] flex-shrink-0 rounded-lg"
        aria-label={`QR code de la commande ${orderNumber}`}
      />
      <div className="min-w-0">
        <div className="font-display text-sm font-semibold text-ink">
          Votre QR de commande
        </div>
        <p className="mt-0.5 text-xs leading-snug text-mute">
          Présentez-le au comptoir ou au livreur : il permet de retrouver
          votre commande {orderNumber} instantanément.
        </p>
      </div>
    </div>
  );
}
