import "server-only";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Credential, McpWrapper } from "@prisma/client";
import { QuickbooksMcp, type QuickbooksRealm } from "@/lib/quickbooks/QuickbooksMcp";
import { fetchNangoToken, parseNangoRef } from "@/lib/nango";
import { decryptContent } from "@/lib/crypto";

export type WrapperWithCredentials = McpWrapper & { credentials: Credential[] };

// The in-process MCP a wrapper serves. Only QuickbooksMcp exists today; both its
// tool surface and its call semantics are identical shape, so one type suffices.
export type ComposedMcp = QuickbooksMcp;

// Tools contributed by a wrapper are prefixed with "<slug>__" (same convention
// as toolsets).
export const wrapperPrefix = (w: McpWrapper) => `${w.slug}__`;

// A tool name belongs to this wrapper when it carries its prefix.
export function wrapperOwns(w: McpWrapper, name: string): boolean {
  return name.startsWith(wrapperPrefix(w));
}

// Builds the in-process MCP for a wrapper's `type`. `realms` may be empty when
// only the (fixed) tool surface is needed — see wrapperToolDefs.
export function buildComposedMcp(type: string, realms: QuickbooksRealm[]): ComposedMcp {
  if (type === "quickbooks") return new QuickbooksMcp(realms);
  throw new Error(`Unsupported composed MCP type "${type}".`);
}

// Tool defs a wrapper contributes: its in-process tools, slug-prefixed. Listing
// does NOT resolve credentials — the tool surface is fixed by the type.
export function wrapperToolDefs(w: McpWrapper): Tool[] {
  const mcp = buildComposedMcp(w.type, []);
  return mcp.listTools().map((t) => ({ ...t, name: `${wrapperPrefix(w)}${t.name}` }));
}

export type WrapperCallOutcome = { result: CallToolResult };

// Dispatches one slug-prefixed call: resolve credentials to realms, build the
// in-process MCP, strip the prefix and call it.
export async function handleWrapperCall(
  w: WrapperWithCredentials,
  name: string,
  args: Record<string, unknown>,
): Promise<WrapperCallOutcome> {
  const realms = await resolveRealms(w);
  const mcp = buildComposedMcp(w.type, realms);
  const original = name.slice(wrapperPrefix(w).length);
  const result = await mcp.callTool(original, args);
  return { result };
}

// Resolves each attached credential to a QuickBooks realm. You can attach "any
// credentials", but only ones that yield both an access token and a realmId
// become realms; the rest are skipped.
export async function resolveRealms(w: WrapperWithCredentials): Promise<QuickbooksRealm[]> {
  const realms: QuickbooksRealm[] = [];
  for (const cred of w.credentials) {
    const realm = await resolveRealm(cred);
    if (realm) realms.push(realm);
  }
  return realms;
}

async function resolveRealm(cred: Credential): Promise<QuickbooksRealm | null> {
  // NANGO credentials expose exactly what we need on reveal: a fresh access
  // token plus the realmId from the connection config.
  if (cred.type === "NANGO") {
    const ref = parseNangoRef(cred.credentialRef);
    if (!ref) return null;
    const token = await fetchNangoToken(ref);
    if (!token.realmId) return null;
    return { accessToken: token.accessToken, realmId: token.realmId };
  }
  // A static secret only qualifies if its decrypted value is JSON carrying both
  // fields. Anything else is simply not a QuickBooks credential — skip it.
  if (!cred.content) return null;
  try {
    const { value } = decryptContent(Buffer.from(cred.content));
    const parsed = JSON.parse(value) as { accessToken?: unknown; realmId?: unknown };
    if (typeof parsed.accessToken === "string" && typeof parsed.realmId === "string") {
      return { accessToken: parsed.accessToken, realmId: parsed.realmId };
    }
  } catch {
    // Not JSON, or not the shape we need — not a QuickBooks credential.
  }
  return null;
}
