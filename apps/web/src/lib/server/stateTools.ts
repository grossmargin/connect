import "server-only";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { errorResult, text } from "@/lib/server/mcpToolShared";

// Key/value state that a bundle's callers save between runs. Every query is
// limited to `scopeId`, the bundle that serves the call.

const nsKey = {
  namespace: { type: "string", description: "Groups related keys, e.g. a job name." },
  key: { type: "string" },
};

export const STATE_TOOLS: Tool[] = [
  {
    name: "state_save",
    description:
      "Save a JSON value under namespace + key, replacing any old value. Use it to keep state between runs. " +
      'For text memory, save `{ "type": "text", "text": "<markdown>" }`; any other JSON is stored as-is.',
    inputSchema: {
      type: "object",
      properties: { ...nsKey, value: { description: "Any JSON value except null." } },
      required: ["namespace", "key", "value"],
    },
  },
  {
    name: "state_get",
    description: "Get the value saved under namespace + key. Returns `value: null` if there is none.",
    inputSchema: { type: "object", properties: nsKey, required: ["namespace", "key"] },
  },
  {
    name: "state_list",
    description:
      "List saved states (namespace, key, size in bytes, updatedAt), without values. " +
      "Filter by exact namespace/key or by a POSIX regex (e.g. `^jobs/`). No filter lists all.",
    inputSchema: {
      type: "object",
      properties: {
        namespace: { type: "string", description: "Exact namespace." },
        namespaceRegex: { type: "string", description: "Regex the namespace must match." },
        key: { type: "string", description: "Exact key." },
        keyRegex: { type: "string", description: "Regex the key must match." },
      },
    },
  },
  {
    name: "state_delete",
    description: "Delete the value saved under namespace + key.",
    inputSchema: { type: "object", properties: nsKey, required: ["namespace", "key"] },
  },
];
export const STATE_TOOL_NAMES = new Set(STATE_TOOLS.map((t) => t.name));

function json(data: unknown): CallToolResult {
  return text(JSON.stringify(data, null, 2));
}

function str(args: Record<string, unknown>, name: string): string | null {
  const v = args[name];
  return typeof v === "string" && v !== "" ? v : null;
}

// Returns an error message, or null when the value can be saved.
export function invalidStateValue(value: unknown): string | null {
  if (value === undefined || value === null) return "value is required. To remove a state, call state_delete.";
  const v = value as { type?: unknown; text?: unknown };
  if (typeof value === "object" && !Array.isArray(value) && v.type === "text" && typeof v.text !== "string") {
    return 'A value with `type: "text"` must have a string `text`.';
  }
  return null;
}

export type StateMeta = { namespace: string; key: string; size: number; updatedAt: Date };

export async function listStates(
  scopeId: string,
  f: { namespace?: string | null; namespaceRegex?: string | null; key?: string | null; keyRegex?: string | null } = {},
): Promise<StateMeta[]> {
  const conds = [Prisma.sql`"scopeId" = ${scopeId}::uuid`];
  if (f.namespace) conds.push(Prisma.sql`"namespace" = ${f.namespace}`);
  if (f.namespaceRegex) conds.push(Prisma.sql`"namespace" ~ ${f.namespaceRegex}`);
  if (f.key) conds.push(Prisma.sql`"key" = ${f.key}`);
  if (f.keyRegex) conds.push(Prisma.sql`"key" ~ ${f.keyRegex}`);
  const rows = await prisma.$queryRaw<{ namespace: string; key: string; size: number; updatedAt: Date }[]>`
    SELECT "namespace", "key", octet_length("value"::text)::int AS "size", "updatedAt"
    FROM "BundleState"
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY "namespace", "key"`;
  return rows;
}

async function list(scopeId: string, args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    const rows = await listStates(scopeId, {
      namespace: str(args, "namespace"),
      namespaceRegex: str(args, "namespaceRegex"),
      key: str(args, "key"),
      keyRegex: str(args, "keyRegex"),
    });
    return json({ states: rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })) });
  } catch (e) {
    // Postgres rejects a malformed regex (SQLSTATE 2201B).
    if (e instanceof Prisma.PrismaClientKnownRequestError && /2201B|regular expression/i.test(e.message)) {
      return errorResult("Invalid regex.");
    }
    throw e;
  }
}

export async function runStateTool(
  scopeId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  if (name === "state_list") return list(scopeId, args);

  const namespace = str(args, "namespace");
  const key = str(args, "key");
  if (!namespace || !key) return errorResult("namespace and key are required.");
  const where = { scopeId_namespace_key: { scopeId, namespace, key } };

  if (name === "state_get") {
    const row = await prisma.bundleState.findUnique({ where, select: { value: true, updatedAt: true } });
    return json({ namespace, key, value: row?.value ?? null, updatedAt: row?.updatedAt.toISOString() ?? null });
  }
  if (name === "state_save") {
    const invalid = invalidStateValue(args.value);
    if (invalid) return errorResult(invalid);
    const value = args.value as Prisma.InputJsonValue;
    const row = await prisma.bundleState.upsert({
      where,
      create: { scopeId, namespace, key, value },
      update: { value },
      select: { updatedAt: true },
    });
    return json({ namespace, key, updatedAt: row.updatedAt.toISOString() });
  }
  if (name === "state_delete") {
    const { count } = await prisma.bundleState.deleteMany({ where: { scopeId, namespace, key } });
    return json({ namespace, key, deleted: count > 0 });
  }
  return errorResult(`Unknown tool "${name}".`);
}
