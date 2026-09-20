import { createHash, randomBytes } from "crypto";

// Raw token -> stored hash. Tokens are shown once; we only keep the hash.
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Service account key: sa_<random>. Prefix stored for display (sa_abcd…).
export function generateServiceAccountKey(): { raw: string; hash: string; prefix: string } {
  const raw = "sa_" + randomBytes(24).toString("base64url");
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 8) };
}

export function generateOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}
