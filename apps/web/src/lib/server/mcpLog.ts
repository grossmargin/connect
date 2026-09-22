import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { principalActor, type Principal } from "@/lib/server/mcp";

export type McpCallEntry = {
  source: "root" | "group" | "connection" | "wrapper";
  teamId?: string | null;
  // For a group call this holds the group id (the column predates groups).
  toolsetId?: string | null;
  connectionId?: string | null;
  tenant?: string | null;
  toolName: string;
  args?: unknown;
  ok: boolean;
  error?: string | null;
  durationMs?: number;
  // Free-form: request metadata (ip, headers, user-agent), stack traces, the
  // returned result on error, and anything else worth keeping.
  details?: unknown;
};

// Logs one MCP tool call. Best-effort — never throws into the call path.
export async function logMcpCall(principal: Principal, entry: McpCallEntry): Promise<void> {
  const actor = principalActor(principal);
  await prisma.mcpCallLog
    .create({
      data: {
        teamId: entry.teamId ?? null,
        source: entry.source,
        toolsetId: entry.toolsetId ?? null,
        connectionId: entry.connectionId ?? null,
        actorType: actor.actorType,
        actorId: actor.actorId,
        tenant: entry.tenant ?? null,
        toolName: entry.toolName,
        args: (entry.args ?? undefined) as Prisma.InputJsonValue | undefined,
        ok: entry.ok,
        error: entry.error ?? null,
        durationMs: entry.durationMs ?? null,
        details: (entry.details ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    })
    .catch(() => {});
}
