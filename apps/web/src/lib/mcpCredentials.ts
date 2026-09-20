import "server-only";
import { z } from "zod";
import { encrypt, decrypt } from "@/lib/crypto";

// Auth types this app can use to reach an MCP server. The McpConnection.authType
// column is a plain string; these are its allowed values. Add a new member here
// and a matching credential schema below when supporting a new type.
export const MCP_AUTH_TYPES = ["DCR", "HEADERS"] as const;
export type McpAuthType = (typeof MCP_AUTH_TYPES)[number];

const oauthTokens = {
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  tokenExpiresAt: z.number().int().optional(), // epoch ms
};

// DCR: we self-registered an OAuth client (RFC 7591) and run the auth-code flow.
export const dcrCredentials = z.object({
  authType: z.literal("DCR"),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  authorizationServerUrl: z.string().optional(),
  resource: z.string().optional(),
  scope: z.string().optional(),
  ...oauthTokens,
});
export type DcrCredentials = z.infer<typeof dcrCredentials>;

// HEADERS: no OAuth. The user supplies a set of HTTP headers (typically an
// `Authorization: Bearer <token>` line) that we attach verbatim to every
// request to the server. Used for servers that authenticate with a static
// token / PAT rather than a self-service OAuth client (e.g. Deel). The whole
// map is encrypted at rest like any other credential.
export const headersCredentials = z.object({
  authType: z.literal("HEADERS"),
  headers: z.record(z.string(), z.string()),
});
export type HeadersCredentials = z.infer<typeof headersCredentials>;

// The decrypted shape of McpConnection.encryptedCredentials. Discriminated on
// authType; extend the union as new auth types are added.
export const mcpCredentials = z.discriminatedUnion("authType", [dcrCredentials, headersCredentials]);
export type McpCredentials = z.infer<typeof mcpCredentials>;

// Parses the plain-textarea header input into a header map. Each non-empty line
// is `Name: value` (the first colon splits it); blank lines and `#` comments are
// ignored. Throws on a line without a colon or an empty header name so the user
// gets a clear error rather than a silently dropped header.
export function parseHeaderText(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) throw new Error(`Line ${i + 1}: expected "Name: value".`);
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!name) throw new Error(`Line ${i + 1}: header name is empty.`);
    headers[name] = value;
  }
  return headers;
}

// Returns a fresh-ArrayBuffer Uint8Array for Prisma's Bytes column.
export function packCredentials(creds: McpCredentials): Uint8Array<ArrayBuffer> {
  const buf = encrypt(JSON.stringify(creds));
  const out = new Uint8Array(buf.byteLength);
  out.set(buf);
  return out;
}

// Returns null ONLY when nothing is stored (the connection was never
// registered). When bytes exist but can't be decrypted or parsed — a wrong
// ENCRYPTION_KEY, a corrupt row, or a schema drift — that is a real fault, not
// an unregistered connection, so we throw with the underlying reason instead of
// silently returning null (which callers report as "not registered").
export function readCredentials(enc: Uint8Array | null | undefined): McpCredentials | null {
  if (!enc || enc.byteLength === 0) return null;
  let json: string;
  try {
    json = decrypt(Buffer.from(enc));
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Stored credentials could not be decrypted (${reason}). This usually means ENCRYPTION_KEY differs from the key that wrote this row.`);
  }
  try {
    return mcpCredentials.parse(JSON.parse(json));
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`Stored credentials decrypted but are not in the expected shape (${reason}).`);
  }
}
