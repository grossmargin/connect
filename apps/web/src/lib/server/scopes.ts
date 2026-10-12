import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";

// A Published MCP with the members it exposes: individual connections plus
// tenanted groups (and each group's tenant connections). `vaultMode` + `vaults`
// decide whether credentials are exposed (see exposesCredentials). `bots` are the
// bots whose messages the bundle exposes. `serviceConnections` feed the
// API credential tools.
export type ScopeWithMembers = Prisma.McpScopeGetPayload<{
  include: {
    connections: true;
    groups: { include: { tenants: true } };
    vaults: { select: { id: true } };
    bots: { select: { id: true; name: true; username: true; platform: true; description: true } };
    serviceConnections: true;
  };
}>;

// Vaults are no longer used for grouping: a bundle exposes either all team
// credentials or none. Stored in the old columns so no data changes:
// on = vaultMode ALL (exceptions are ignored), off = vaultMode LIST with no
// vaults. A LIST with any vault (an old allow-list) counts as on.
export function exposesCredentials(scope: { vaultMode: string; vaults: unknown[] }): boolean {
  return scope.vaultMode !== "LIST" || scope.vaults.length > 0;
}

const DEFAULT_INCLUDE = {
  connections: true,
  groups: { include: { tenants: true } },
  vaults: { select: { id: true } },
  bots: { select: { id: true, name: true, username: true, platform: true, description: true } },
  serviceConnections: { orderBy: { name: "asc" } },
} as const;

// The team's default Published MCP (served at the team root). Created empty on
// first use. Members are added explicitly.
export async function getOrCreateDefaultScope(teamId: string): Promise<ScopeWithMembers> {
  const existing = await prisma.mcpScope.findFirst({
    where: { teamId, isDefault: true },
    include: DEFAULT_INCLUDE,
  });
  if (existing) return existing;

  try {
    return await prisma.mcpScope.create({
      data: { teamId, name: "Default", slug: "", isDefault: true },
      include: DEFAULT_INCLUDE,
    });
  } catch (e) {
    // Lost a race to create it — fetch the winner.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const scope = await prisma.mcpScope.findFirst({
        where: { teamId, isDefault: true },
        include: DEFAULT_INCLUDE,
      });
      if (scope) return scope;
    }
    throw e;
  }
}

// The Published MCP at a given path segment, or the default one when no segment
// is given. Returns null for an unknown named endpoint.
export async function resolveScope(
  teamId: string,
  scopeSlug?: string | null,
): Promise<ScopeWithMembers | null> {
  if (!scopeSlug) return getOrCreateDefaultScope(teamId);
  return prisma.mcpScope.findUnique({
    where: { teamId_slug: { teamId, slug: scopeSlug } },
    include: DEFAULT_INCLUDE,
  });
}
