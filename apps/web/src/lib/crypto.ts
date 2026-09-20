import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Envelope: [ver:1][keyId:4][iv:12][tag:16][ciphertext]
const VERSION = 1;
const KEYID_LEN = 4;
const IV_LEN = 12;
const TAG_LEN = 16;

type Key = { id: Buffer; raw: Buffer };

function loadKeys(): Key[] {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is not set");
  const keys = raw
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((b64) => {
      const buf = Buffer.from(b64, "base64");
      if (buf.length !== 32) throw new Error("each ENCRYPTION_KEY must be 32 bytes (base64)");
      return { id: keyId(buf), raw: buf };
    });
  if (keys.length === 0) throw new Error("ENCRYPTION_KEY has no keys");
  return keys;
}

// Short stable fingerprint so the right key is chosen for decrypt.
function keyId(raw: Buffer): Buffer {
  return createHash("sha256").update(raw).digest().subarray(0, KEYID_LEN);
}

// Encrypt with the newest (first) key.
export function encrypt(plaintext: string): Buffer {
  const [key] = loadKeys();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key.raw, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([VERSION]), key.id, iv, tag, ct]);
}

export function decrypt(envelope: Buffer): string {
  if (envelope.length < 1 + KEYID_LEN + IV_LEN + TAG_LEN) throw new Error("envelope too short");
  let off = 0;
  const ver = envelope[off];
  off += 1;
  if (ver !== VERSION) throw new Error(`unknown envelope version ${ver}`);
  const id = envelope.subarray(off, (off += KEYID_LEN));
  const iv = envelope.subarray(off, (off += IV_LEN));
  const tag = envelope.subarray(off, (off += TAG_LEN));
  const ct = envelope.subarray(off);

  const key = loadKeys().find((k) => k.id.equals(id));
  if (!key) throw new Error("no ENCRYPTION_KEY matches this credential");

  const decipher = createDecipheriv("aes-256-gcm", key.raw, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

// Credential content is stored as encrypted JSON: { value: string }.
export type CredentialContent = { value: string };

// Returns a plain Uint8Array (fresh ArrayBuffer) for Prisma's Bytes column.
export function encryptContent(content: CredentialContent): Uint8Array<ArrayBuffer> {
  const buf = encrypt(JSON.stringify(content));
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

export function decryptContent(envelope: Buffer | Uint8Array): CredentialContent {
  return JSON.parse(decrypt(Buffer.from(envelope))) as CredentialContent;
}
