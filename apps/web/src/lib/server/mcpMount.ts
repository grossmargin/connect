import { NextResponse } from "next/server";
import { prisma } from "@/lib/server/db";
import { buildMcpHandler } from "@/lib/server/mcpServer";
import { renderRootInstructions } from "@/lib/isomorphic/mcpInstructions";
import { resolveScope } from "@/lib/server/scopes";

// Serve one team's Published MCP. With no `scopeSlug` this is the team's default
// Published MCP (served at / and /[teamSlug]); with a slug it is the named one at
// /[teamSlug]/[slug]. Only that endpoint's members — individual connections and
// tenanted groups — are exposed. The handler endpoint matches the incoming path
// (so it works behind a middleware rewrite) and the principal is narrowed to
// `teamId`.
export async function serveTeamMcp(req: Request, teamId: string, scopeSlug?: string) {
  const scope = await resolveScope(teamId, scopeSlug);
  if (!scope) {
    return NextResponse.json({ error: "unknown scope" }, { status: 404 });
  }

  const connections = [...scope.connections].sort((a, b) => a.name.localeCompare(b.name));
  const groups = [...scope.groups].sort((a, b) => a.name.localeCompare(b.name));

  // Vaults this bundle exposes. LIST: only the selected ones. ALL: every team
  // vault minus the selected ones (exceptions).
  const selectedVaultIds = new Set(scope.vaults.map((v) => v.id));
  const teamVaults = await prisma.vault.findMany({
    where: { teamId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, description: true },
  });
  const allowedVaults =
    scope.vaultMode === "LIST"
      ? teamVaults.filter((v) => selectedVaultIds.has(v.id))
      : teamVaults.filter((v) => !selectedVaultIds.has(v.id));
  const vaultFilter = { allowedVaultIds: allowedVaults.map((v) => v.id) };
  const vaults = allowedVaults.map((v) => ({ name: v.name, description: v.description }));

  const instructions = renderRootInstructions(
    groups.map((g) => ({
      name: g.name,
      slug: g.slug,
      tenants: g.tenants.map((c) => ({ id: c.slug, name: c.name })),
    })),
    connections.map((c) => ({ name: c.name, slug: c.slug })),
    vaults,
    [],
  );

  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler(groups, connections, [], instructions, {
    endpoint,
    teamScope: teamId,
    vaultFilter,
  })(req);
}

// A handler that requires a bearer but serves nothing — used when we cannot pick
// a team (no/invalid bearer). withMcpAuth returns 401 for a missing/bad token.
export function serveUnauthenticatedMcp(req: Request) {
  const endpoint = new URL(req.url).pathname;
  return buildMcpHandler([], [], [], undefined, { endpoint })(req);
}
