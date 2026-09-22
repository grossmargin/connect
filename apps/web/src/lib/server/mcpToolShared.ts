import "server-only";
import type { McpConnection } from "@prisma/client";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { prisma } from "@/lib/server/db";
import { readCredentials, packCredentials } from "@/lib/server/mcpCredentials";
import { resolveAuthHeaders, type AuthHeaders } from "@/lib/server/mcpClient";

export function text(s: string): CallToolResult {
  return { content: [{ type: "text", text: s }] };
}
export function errorResult(s: string): CallToolResult {
  return { content: [{ type: "text", text: s }], isError: true };
}

// Joins the text parts of a result — used to log the message an error result
// carried back to the caller.
export function resultText(result: CallToolResult): string {
  return (result.content ?? [])
    .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
    .join("\n");
}

export function headerValue(headers: Record<string, string | string[]> | undefined, name: string) {
  if (!headers) return undefined;
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

// Auth headers to reach one member connection, persisting an OAuth refresh if it
// happened.
export async function memberHeaders(conn: McpConnection): Promise<AuthHeaders> {
  const creds = readCredentials(conn.encryptedCredentials);
  if (!creds) throw new Error(`"${conn.name}" is not registered.`);
  const { headers, refreshedCreds } = await resolveAuthHeaders(conn, creds);
  if (refreshedCreds) {
    await prisma.mcpConnection.update({
      where: { id: conn.id },
      data: { encryptedCredentials: packCredentials(refreshedCreds) },
    });
  }
  return headers;
}
