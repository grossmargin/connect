import { createHash, randomBytes } from "crypto";

// Raw token -> stored hash. Tokens are shown once; we only keep the hash.
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Service account key: sa_<random>. We keep only the hash and a masked hint
// (`sa_abc12…xyz89`) for display; the raw token is shown once at creation.
export function generateServiceAccountKey(): { raw: string; hash: string; hint: string } {
  const raw = "sa_" + randomBytes(48).toString("base64url");
  const hint = `${raw.slice(0, 8)}…${raw.slice(-5)}`;
  return { raw, hash: hashToken(raw), hint };
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}
