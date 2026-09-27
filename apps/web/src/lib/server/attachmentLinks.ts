import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, expiring download links for bot attachments. Anyone with the link can
// download the file until it expires, so links are only handed to callers that
// may read the attachment.

export const ATTACHMENT_LINK_TTL_SECONDS = 15 * 60;

function signature(secret: string, attachmentId: string, exp: number): string {
  return createHmac("sha256", secret).update(`bot-attachment:${attachmentId}:${exp}`).digest("base64url");
}

// Query string for a link that expires `ttlSeconds` after `now` (unix seconds).
export function signAttachmentQuery(
  secret: string,
  attachmentId: string,
  now = Math.floor(Date.now() / 1000),
  ttlSeconds = ATTACHMENT_LINK_TTL_SECONDS,
): { exp: number; sig: string } {
  const exp = now + ttlSeconds;
  return { exp, sig: signature(secret, attachmentId, exp) };
}

export function verifyAttachmentQuery(
  secret: string,
  attachmentId: string,
  exp: string | null,
  sig: string | null,
  now = Math.floor(Date.now() / 1000),
): boolean {
  const expNum = Number(exp);
  if (!sig || !Number.isInteger(expNum) || expNum < now) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(signature(secret, attachmentId, expNum));
  return a.length === b.length && timingSafeEqual(a, b);
}
