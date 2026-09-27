import { expect, test } from "bun:test";
import { signAttachmentQuery, verifyAttachmentQuery } from "./attachmentLinks";

const NOW = 1_700_000_000;

test("link is valid until it expires, and only for its attachment and secret", () => {
  const { exp, sig } = signAttachmentQuery("s", "a1", NOW, 60);
  expect(verifyAttachmentQuery("s", "a1", String(exp), sig, NOW + 60)).toBe(true);
  expect(verifyAttachmentQuery("s", "a1", String(exp), sig, NOW + 61)).toBe(false);
  expect(verifyAttachmentQuery("s", "a2", String(exp), sig, NOW)).toBe(false);
  expect(verifyAttachmentQuery("x", "a1", String(exp), sig, NOW)).toBe(false);
  // Extending the expiry breaks the signature.
  expect(verifyAttachmentQuery("s", "a1", String(exp + 3600), sig, NOW)).toBe(false);
});
