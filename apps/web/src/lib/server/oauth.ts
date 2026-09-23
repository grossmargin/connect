import { createHash } from "crypto";
import { serverEnv } from "@/lib/server/serverEnv";

export const OAUTH_SCOPE = "credentials:read";
export const ACCESS_TTL_SEC = 60 * 60; // 1h
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30d
export const CODE_TTL_SEC = 60 * 5; // 5m

// Origin of this deployment, used to build OAuth metadata + endpoint URLs.
// Derived from the actual request host so it always matches the domain the
// client used (the resource identifier must match, or discovery fails). Falls
// back to APP_URL, then the request URL.
export function baseUrl(req: Request): string {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    return `${proto}://${host}`;
  }
  if (serverEnv.APP_URL) return serverEnv.APP_URL.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

// PKCE S256 check.
export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method === "plain") return verifier === challenge;
  const digest = createHash("sha256").update(verifier).digest("base64url");
  return digest === challenge;
}
