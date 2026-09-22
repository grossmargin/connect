import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// One authorized QuickBooks Online company. `accessToken` is a live OAuth token
// (already refreshed by whoever resolved it); `realmId` is the company id the
// token can act on.
export type QuickbooksRealm = { accessToken: string; realmId: string };

// An in-process MCP over the QuickBooks Online API.
//
// Deliberately decoupled from the rest of the app: it knows nothing about
// Prisma, HTTP, auth, or mcp-handler. The caller resolves credentials into
// `realms` and wires listTools()/callTool() into whatever transport serves it.
//
// The tool surface is fixed by the class and does NOT depend on `realms` — so
// listing tools is cheap and needs no live tokens. `realms` are consulted only
// when a tool is actually called (each tool takes a `realmId` to pick the
// company). Tools are added later; for now this is a structural skeleton with
// no tools.
export class QuickbooksMcp {
  constructor(private readonly realms: QuickbooksRealm[]) {}

  // The tools this wrapper exposes. Empty until tools are implemented.
  listTools(): Tool[] {
    return [];
  }

  // Agent-facing guidance for the wrapped API.
  instructions(): string {
    return INSTRUCTIONS;
  }

  // Dispatches one tool call. There are no tools yet, so every name is unknown.
  async callTool(name: string, _args: Record<string, unknown>): Promise<CallToolResult> {
    throw new Error(`Unknown QuickBooks tool "${name}".`);
  }

  // The companies this instance can act on (ids only — never exposes tokens).
  realmIds(): string[] {
    return this.realms.map((r) => r.realmId);
  }

  // Resolves a `realmId` arg to its authorized realm. Tool implementations will
  // call this to get the token for the company they act on.
  protected realm(realmId: string): QuickbooksRealm {
    const found = this.realms.find((r) => r.realmId === realmId);
    if (found) return found;
    const known = this.realmIds().join(", ") || "(none)";
    throw new Error(`Unknown realmId "${realmId}". Authorized companies: ${known}.`);
  }
}

const INSTRUCTIONS = `QuickBooks Online.

This wrapper exposes the QuickBooks Online API as MCP tools. It can be backed by
several companies at once; pass the target company's \`realmId\` on every tool
call. No tools are available yet.`;
