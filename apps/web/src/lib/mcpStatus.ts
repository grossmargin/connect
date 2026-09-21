import "server-only";
import { prisma } from "@/lib/db";
import { probeServer } from "@/lib/mcpClient";
import { memberHeaders } from "@/lib/mcpToolShared";
import type { Principal } from "@/lib/mcp";

export type ConnectionHealth = {
  status: "ok" | "error";
  name: string;
  error?: string;
};

// Keyed by connection slug.
export type StatusReport = {
  connections: Record<string, ConnectionHealth>;
};

// Actually connects to every MCP connection of the caller's teams (auth +
// tools/list) and reports the result. Live check, not cached state.
export async function connectionStatusReport(principal: Principal): Promise<StatusReport> {
  const conns = await prisma.mcpConnection.findMany({
    where: { teamId: { in: principal.teamIds } },
    orderBy: { name: "asc" },
  });

  const connections: Record<string, ConnectionHealth> = {};
  await Promise.all(
    conns.map(async (conn) => {
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

  return { connections };
}
