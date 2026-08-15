/**
 * Provider RÉEL — API officielle Google Business Profile, RIEN d'autre
 * (décision Augustin 14.08.2026 : aucun service tiers, jamais).
 *
 * AUTH : service account OAuth2 (JWT RS256 signé en Node natif, zéro
 * dépendance). Prérequis côté Google (procédure complète dans
 * docs/REVIEW_GATE.md) :
 *   1. Le restaurateur ajoute Augustin MANAGER de la fiche ;
 *   2. Projet Google Cloud + activation « Google Business Profile API »
 *      + formulaire d'accès (quota par défaut = 0 tant que Google n'a
 *      pas approuvé la demande) ;
 *   3. Service account créé, puis INVITÉ comme Manager de la fiche
 *      (c'est l'invitation qui lui ouvre les avis) ;
 *   4. Env posées : GBP_SA_CLIENT_EMAIL, GBP_SA_PRIVATE_KEY (clé PEM,
 *      \n littéraux acceptés), GBP_ACCOUNT_ID, GBP_LOCATION_ID.
 *
 * Endpoint : la liste des avis vit encore sur l'API v4
 * (mybusiness.googleapis.com/v4/accounts/{a}/locations/{l}/reviews) —
 * les nouvelles surfaces Business Profile ne couvrent pas les avis à ce
 * jour. Tri par updateTime desc, pageSize 50 : suffisant, on ne matche
 * que des avis récents.
 */

import { createSign } from "node:crypto";
import type { PublishedReview, ReviewProvider } from "./provider";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/business.manage";
/** Timeout des appels Google — un appel qui pend ne doit jamais tenir la
 * fonction Vercel jusqu'à son propre timeout. */
const FETCH_TIMEOUT_MS = 10_000;
/**
 * Caches module-scope (survivent entre invocations sur une même lambda
 * chaude) : le quota Business Profile est bas et dur à obtenir — N
 * clients en pending qui re-checkent doivent s'effondrer en 1 appel
 * réel par minute, pas N × 2 toutes les 2 min (relecture 14.08).
 */
const REVIEWS_CACHE_MS = 60_000;
let tokenCache: { token: string; expiresAtMs: number } | null = null;
let reviewsCache: { avis: PublishedReview[]; fetchedAtMs: number } | null =
  null;

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function accessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAtMs) {
    return tokenCache.token;
  }
  const clientEmail = process.env.GBP_SA_CLIENT_EMAIL;
  const privateKey = process.env.GBP_SA_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !privateKey) {
    throw new Error(
      "GBP_SA_CLIENT_EMAIL / GBP_SA_PRIVATE_KEY manquantes — cf. docs/REVIEW_GATE.md",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${payload}`);
  const signature = b64url(signer.sign(privateKey));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${payload}.${signature}`,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`OAuth GBP: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("OAuth GBP: pas d'access_token");
  // Marge 5 min sur l'expiration (jeton d'une heure).
  tokenCache = {
    token: body.access_token,
    expiresAtMs: Date.now() + 55 * 60 * 1000,
  };
  return body.access_token;
}

type GbpReview = {
  reviewId?: string;
  name?: string;
  reviewer?: { displayName?: string };
  createTime?: string;
};

export class GoogleReviewProvider implements ReviewProvider {
  readonly name = "google-business-profile";

  async listRecentReviews(): Promise<PublishedReview[]> {
    if (
      reviewsCache &&
      Date.now() - reviewsCache.fetchedAtMs < REVIEWS_CACHE_MS
    ) {
      return reviewsCache.avis;
    }

    const account = process.env.GBP_ACCOUNT_ID;
    const location = process.env.GBP_LOCATION_ID;
    if (!account || !location) {
      throw new Error(
        "GBP_ACCOUNT_ID / GBP_LOCATION_ID manquantes — cf. docs/REVIEW_GATE.md",
      );
    }

    const token = await accessToken();
    const url =
      `https://mybusiness.googleapis.com/v4/accounts/${encodeURIComponent(account)}` +
      `/locations/${encodeURIComponent(location)}/reviews?pageSize=50&orderBy=updateTime%20desc`;
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`GBP reviews: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { reviews?: GbpReview[] };

    const avis = (body.reviews ?? [])
      .map((r) => ({
        id: r.reviewId ?? r.name ?? "",
        authorName: r.reviewer?.displayName ?? "",
        publishedAt: r.createTime ?? "",
      }))
      .filter((r) => r.id && r.authorName && r.publishedAt);
    reviewsCache = { avis, fetchedAtMs: Date.now() };
    return avis;
  }
}
