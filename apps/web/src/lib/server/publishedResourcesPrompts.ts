import "server-only";
import type {
  Resource,
  ReadResourceResult,
  Prompt,
  GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpConnection } from "@prisma/client";
import {
  listConnResources,
  readConnResource,
  listConnPrompts,
  getConnPrompt,
} from "@/lib/server/upstream";
import { connPrefix, groupPrefix, type GroupWithTenants } from "@/lib/server/publishedTools";

// Resources and prompts are proxied alongside tools. Prompts are capability-like
// (identical per tenant), so they are name-prefixed exactly like tools — a
// group's prompts take a `tenant` argument. Resources are per-account data and
// `resources/read` carries only a URI, so the owning connection is encoded into
// the exposed URI instead.

// ---------- resources ----------

const RES_SCHEME = "gmc";

// Wrap an upstream URI so it round-trips through resources/read back to the right
// connection: gmc://<connSlug>/<base64url(originalUri)>.
function wrapUri(connSlug: string, uri: string): string {
  return `${RES_SCHEME}://${connSlug}/${Buffer.from(uri).toString("base64url")}`;
}

function unwrapUri(wrapped: string): { slug: string; uri: string } | null {
  const m = wrapped.match(new RegExp(`^${RES_SCHEME}://([^/]+)/(.+)$`));
  if (!m) return null;
  try {
    return { slug: decodeURIComponent(m[1]), uri: Buffer.from(m[2], "base64url").toString() };
  } catch {
    return null;
  }
}

// Every member connection reachable in a bundle: individual members plus every
// group's tenants. Used to route a resources/read by encoded slug.
function memberConnections(connections: McpConnection[], groups: GroupWithTenants[]): McpConnection[] {
  return [...connections, ...groups.flatMap((g) => g.tenants)];
}

async function resourcesFor(conn: McpConnection): Promise<Resource[]> {
  let list: Resource[] = [];
  try {
    list = await listConnResources(conn);
  } catch (e) {
    // Many servers declare `resources` but expose none / return method-not-found.
    console.error(`resources unavailable for "${conn.name}": ${e instanceof Error ? e.message : e}`);
    return [];
  }
  return list.map((r) => ({
    ...r,
    uri: wrapUri(conn.slug, r.uri),
    // Disambiguate identical names across tenants/services.
    name: `${conn.slug}: ${r.name}`,
  }));
}

export async function listAllResources(
  connections: McpConnection[],
  groups: GroupWithTenants[],
): Promise<Resource[]> {
  const conns = memberConnections(connections, groups);
  const perConn = await Promise.all(conns.map(resourcesFor));
  return perConn.flat();
}

export async function handleResourceRead(
  connections: McpConnection[],
  groups: GroupWithTenants[],
  wrappedUri: string,
): Promise<ReadResourceResult> {
  const parsed = unwrapUri(wrappedUri);
  if (!parsed) throw new Error(`Unknown resource URI "${wrappedUri}".`);
  const conn = memberConnections(connections, groups).find((c) => c.slug === parsed.slug);
  if (!conn) throw new Error(`No connection "${parsed.slug}" in this endpoint.`);
  return readConnResource(conn, parsed.uri);
}

// ---------- prompts ----------

const TENANT_ARG = {
  name: "tenant",
  description: "Tenant id selecting which account to use (from the group's *_tenants tool).",
  required: true,
};

async function promptsFor(conn: McpConnection): Promise<Prompt[]> {
  try {
    return await listConnPrompts(conn);
  } catch (e) {
    console.error(`prompts unavailable for "${conn.name}": ${e instanceof Error ? e.message : e}`);
    return [];
  }
}

export async function listAllPrompts(
  connections: McpConnection[],
  groups: GroupWithTenants[],
): Promise<Prompt[]> {
  const perConn = await Promise.all(
    connections.map(async (c) =>
      (await promptsFor(c)).map((p) => ({ ...p, name: `${connPrefix(c)}${p.name}` })),
    ),
  );
  // A group's prompts come from its first tenant (like tools) and take a tenant arg.
  const perGroup = await Promise.all(
    groups.map(async (g) => {
      const ref = g.tenants[0];
      if (!ref) return [];
      return (await promptsFor(ref)).map((p) => ({
        ...p,
        name: `${groupPrefix(g)}${p.name}`,
        arguments: [...(p.arguments ?? []), TENANT_ARG],
      }));
    }),
  );
  return [...perConn.flat(), ...perGroup.flat()];
}

export async function handlePromptGet(
  connections: McpConnection[],
  groups: GroupWithTenants[],
  name: string,
  args: Record<string, string>,
): Promise<GetPromptResult> {
  const conn = connections.find((c) => name.startsWith(connPrefix(c)));
  if (conn) return getConnPrompt(conn, name.slice(connPrefix(conn).length), args);

  const group = groups.find((g) => name.startsWith(groupPrefix(g)));
  if (group) {
    const { tenant, ...rest } = args;
    const target = group.tenants.find((t) => t.slug === tenant);
    if (!target) throw new Error(`Unknown tenant "${tenant ?? ""}" for group "${group.name}".`);
    return getConnPrompt(target, name.slice(groupPrefix(group).length), rest);
  }
  throw new Error(`Unknown prompt "${name}".`);
}
