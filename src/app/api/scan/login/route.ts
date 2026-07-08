import { NextRequest, NextResponse } from "next/server";
import {
  isScanConfigured,
  createScanCookie,
  requireScanAuth,
} from "@/lib/scanAuth";

export const dynamic = "force-dynamic";

/**
 * Authentification du scanner de tampons (comptoir).
 *
 * POST { pin } : compare à process.env.SCAN_PIN. Bon PIN → pose le cookie
 * de session signé (30j). Mauvais PIN → 401. Rate-limit anti-brute-force
 * EN MÉMOIRE (5 tentatives / 60s par IP) → 429.
 *
 * GET : check de session (le cookie est httpOnly, donc illisible en JS ;
 * le front interroge cette route au mount pour savoir s'il doit afficher
 * l'écran PIN).
 */

/* ─── Rate limit en mémoire (best-effort) — pattern login-by-phone ──── */
const attempts = new Map<string, { count: number; firstAt: number }>();
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return true;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) return false;
  return true;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(req: NextRequest) {
  if (!isScanConfigured()) {
    return NextResponse.json(
      { ok: false, error: "scan_not_configured" },
      { status: 500 },
    );
  }
  if (requireScanAuth(req)) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  return NextResponse.json({ ok: false }, { status: 401 });
}

export async function POST(req: NextRequest) {
  if (!isScanConfigured()) {
    return NextResponse.json(
      { ok: false, error: "scan_not_configured" },
      { status: 500 },
    );
  }

  const ip = clientIp(req);
  if (!checkRateLimit(ip)) {
    console.warn("[scan/login] rate_limited", { ip });
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429 },
    );
  }

  const body = (await req.json().catch(() => null)) as { pin?: string } | null;
  const pin = body?.pin;

  if (!pin || pin !== process.env.SCAN_PIN) {
    return NextResponse.json(
      { ok: false, error: "pin_invalide" },
      { status: 401 },
    );
  }

  const cookie = createScanCookie();
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
