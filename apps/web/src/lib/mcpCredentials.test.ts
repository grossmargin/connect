import { expect, test, beforeAll, mock } from "bun:test";
import { randomBytes } from "crypto";

// `mcpCredentials.ts` imports "server-only" (a Next.js build guard) which has no
// runtime under bun; stub it before importing the module under test.
mock.module("server-only", () => ({}));
const { packCredentials, readCredentials } = await import("./mcpCredentials");
type DcrCredentials = import("./mcpCredentials").DcrCredentials;

const KEY_A = randomBytes(32).toString("base64");
const KEY_B = randomBytes(32).toString("base64");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = `${KEY_A}`;
});

const creds: DcrCredentials = { authType: "DCR", clientId: "client-123" };

test("round-trips DCR credentials", () => {
  const enc = packCredentials(creds);
  expect(readCredentials(enc)).toEqual(creds);
});

test("returns null only when nothing is stored", () => {
  expect(readCredentials(null)).toBeNull();
  expect(readCredentials(undefined)).toBeNull();
  expect(readCredentials(new Uint8Array(0))).toBeNull();
});

// The bug this guards against: a wrong ENCRYPTION_KEY must surface as a clear
// error, never as null (which callers mislabel as "Connection is not registered").
test("throws with a clear reason when the key does not match", () => {
  const enc = packCredentials(creds);
  process.env.ENCRYPTION_KEY = `${KEY_B}`;
  expect(() => readCredentials(enc)).toThrow(/could not be decrypted/i);
  process.env.ENCRYPTION_KEY = `${KEY_A}`;
});

test("throws when bytes are present but corrupt", () => {
  const enc = packCredentials(creds);
  enc[enc.length - 1] ^= 0xff; // break the GCM tag / ciphertext
  expect(() => readCredentials(enc)).toThrow();
});
