import { NextRequest, NextResponse } from "next/server";
import {
  isScanConfigured,
  createScanCookie,
  requireScanAuth,
  verifyScanPin,
} from "@/lib/scanAuth";

export const dynamic = "force-dynamic";

/**
 * Authentification du scanner de tampons (comptoir).
 *
 * POST { pin } : vérifié par `verifyScanPin` (`src/lib/scanAuth.ts`), en
 * TEMPS CONSTANT. Bon PIN → pose le cookie de session signé (7 jours
 * depuis le 22.08.2026 — c'était 30). Mauvais PIN → 401.
 *
 * Rate-limit anti-brute-force EN MÉMOIRE : 5 tentatives / 60 s par IP → 429.
 * ⚠️ CE QUE CE RATE-LIMIT NE FAIT PAS, dit franchement : le `Map` vit dans
 * UNE instance de lambda. Sur du serverless, la limite réelle est de
 * « 5 × nombre d'instances chaudes » par minute et par IP. Il RALENTIT une
 * attaque, il ne la FERME pas. C'est la longueur du PIN qui la ferme —
 * raison du passage à 8 caractères alphanumériques le 22.08.2026.
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

  const body = (await req.json().catch(() => null)) as { pin?: unknown } | null;

  // ⚠️ LA COMPARAISON VIT DANS `verifyScanPin` (`src/lib/scanAuth.ts`), PAS
  // ICI. Elle était écrite `pin !== process.env.SCAN_PIN` à cette ligne :
  // une comparaison de chaînes JS, qui court-circuite au premier caractère
  // différent et fuit donc le préfixe par le temps de réponse — alors que
  // la vérification du cookie, elle, était déjà timing-safe.
  // Règle gravée : une garde qui protège une règle vit DANS la fonction.
  if (!verifyScanPin(body?.pin)) {
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
