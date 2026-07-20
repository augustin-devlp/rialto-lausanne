import type { Metadata } from "next";
import PinGate from "@/components/dashboard/PinGate";
import BottomNav from "@/components/dashboard/BottomNav";

export const metadata: Metadata = {
  title: "Espace restaurateur — Rialto",
  robots: { index: false, follow: false },
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PinGate>
      <div className="min-h-screen bg-cream pb-20">
        <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-lg">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <span className="font-display text-lg font-bold text-rialto">
              Rialto
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-mute">
              Espace restaurateur
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-3xl px-4 py-5">{children}</main>
        <BottomNav />
      </div>
    </PinGate>
  );
}
