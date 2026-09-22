import { createHash } from "crypto";
import { serverEnv } from "@/lib/server/serverEnv";

export const OAUTH_SCOPE = "credentials:read";
export const ACCESS_TTL_SEC = 60 * 60; // 1h
export const REFRESH_TTL_SEC = 60 * 60 * 24 * 30; // 30d
export const CODE_TTL_SEC = 60 * 5; // 5m

// Origin of this deployment, used to build metadata + endpoint URLs.
export function baseUrl(req: Request): string {
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
