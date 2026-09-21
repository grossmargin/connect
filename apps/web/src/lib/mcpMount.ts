import { prisma } from "@/lib/db";
import { buildMcpHandler } from "@/lib/mcpServer";
import { renderRootInstructions } from "@/lib/mcpInstructions";

// Serve the root MCP server scoped to a single team. Loads the team's toolsets,
// composed wrappers and vaults, renders instructions, and builds a handler whose
// endpoint matches the incoming request path (so it works behind a rewrite) and
// whose principal is narrowed to `teamId`.
export async function serveTeamMcp(req: Request, teamId: string) {
  const [toolsets, wrappers, vaults] = await Promise.all([
    prisma.mcpToolset.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      include: { connections: true },
    }),
    prisma.mcpWrapper.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      include: { credentials: true },
    }),
    prisma.vault.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: { name: true, description: true },
    }),
  ]);

  const instructions = renderRootInstructions(
    toolsets.map((t) => ({
      name: t.name,
      slug: t.slug,
      tenants: t.connections.map((c) => ({ id: c.slug, name: c.name })),
    })),
    vaults,
    wrappers.map((w) => ({ name: w.name, slug: w.slug, type: w.type })),
  );

  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler(toolsets, wrappers, instructions, { endpoint, teamScope: teamId })(req);
}

// A handler that requires a bearer but serves nothing — used when we cannot pick
// a team (no/invalid bearer). withMcpAuth returns 401 for a missing/bad token.
export function serveUnauthenticatedMcp(req: Request) {
  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler([], [], undefined, { endpoint })(req);
}
