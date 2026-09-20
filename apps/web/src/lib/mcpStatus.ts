import "server-only";
import { prisma } from "@/lib/db";
import { probeServer } from "@/lib/mcpClient";
import { memberHeaders } from "@/lib/toolsetTools";
import type { Principal } from "@/lib/mcp";

export type ConnectionHealth = {
  status: "ok" | "error";
  name: string;
  error?: string;
};

// Grouped by toolset slug, then connection slug.
export type StatusReport = {
  mcps: Record<string, { name: string; connections: Record<string, ConnectionHealth> }>;
};

// Actually connects to every connection of the caller's toolsets (auth +
// tools/list) and reports the result. Live check, not cached state.
export async function connectionStatusReport(principal: Principal): Promise<StatusReport> {
  const toolsets = await prisma.mcpToolset.findMany({
    where: { teamId: { in: principal.teamIds } },
    orderBy: { name: "asc" },
    include: { connections: true },
  });

  const mcps: StatusReport["mcps"] = {};
  for (const ts of toolsets) {
    const connections: Record<string, ConnectionHealth> = {};
    await Promise.all(
      ts.connections.map(async (conn) => {
        try {
          const headers = await memberHeaders(conn);
          await probeServer(conn, headers);
          connections[conn.slug] = { status: "ok", name: conn.name };
        } catch (e) {
          connections[conn.slug] = {
            status: "error",
            name: conn.name,
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    mcps[ts.slug] = { name: ts.name, connections };
  }

  return { mcps };
}
