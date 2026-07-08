import type { Metadata } from "next";
import ScanClient from "./ScanClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scan — Rialto",
  robots: { index: false, follow: false },
};

/**
 * Page de scan du comptoir (crédit des tampons). Non liée depuis la
 * navigation publique du site. Auth par PIN (cookie httpOnly signé).
 */
export default function ScanPage() {
  return <ScanClient />;
}
