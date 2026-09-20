import { expect, test, beforeAll } from "bun:test";
import { randomBytes } from "crypto";
import { encrypt, decrypt, encryptContent, decryptContent } from "./crypto";

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = `${KEY_A},${KEY_B}`;
});

test("round-trips content", () => {
  const env = encryptContent({ value: "s3cr3t" });
  expect(decryptContent(env)).toEqual({ value: "s3cr3t" });
});

// Keys are read per call, so a rotation (new key prepended) still decrypts old data.
test("decrypts with an old key after rotation", () => {
  const oldEnvelope = encryptContent({ value: "old" });
  process.env.ENCRYPTION_KEY = `${randomBytes(32).toString("base64")},${KEY_A},${KEY_B}`;
  expect(decryptContent(oldEnvelope)).toEqual({ value: "old" });
  process.env.ENCRYPTION_KEY = `${KEY_A},${KEY_B}`;
});

test("tampered ciphertext fails", () => {
  const env = Buffer.from(encrypt("hello"));
  env[env.length - 1] ^= 0xff;
  expect(() => decrypt(env)).toThrow();
});
