import "server-only";
import { probeUrl, type ToolInfo, type AuthHeaders } from "@/lib/server/mcpClient";

// One upstream MCP in an aggregate. `label` is used in error messages.
export type AggregateMember = { label: string; url: string; headers: AuthHeaders };

export type AggregateResult = {
  memberCount: number;
  tools: ToolInfo[];
  instructions?: string;
};

// Aggregates several MCP servers that are expected to expose the SAME tools
// (e.g. multiple single-tenant instances of one product). It verifies the tool
// sets are identical across members and takes the instructions from the first.
export class McpAggregator {
  constructor(private readonly members: AggregateMember[]) {}

  async probe(): Promise<AggregateResult> {
    if (this.members.length === 0) throw new Error("Toolset has no MCP servers.");

    const results = await Promise.all(
      this.members.map(async (m) => ({ label: m.label, ...(await probeUrl(m.url, m.headers)) })),
    );

    const first = results[0];
    const reference = new Set(first.tools.map((t) => t.name));
    for (const other of results.slice(1)) {
      const names = new Set(other.tools.map((t) => t.name));
      const diff = describeDifference(first.label, reference, other.label, names);
      if (diff) throw new Error(diff);
    }

    return { memberCount: results.length, tools: first.tools, instructions: first.instructions };
  }
}

function describeDifference(
  labelA: string,
  a: Set<string>,
  labelB: string,
  b: Set<string>,
): string | null {
  const onlyA = [...a].filter((n) => !b.has(n));
  const onlyB = [...b].filter((n) => !a.has(n));
  if (onlyA.length === 0 && onlyB.length === 0) return null;

  const parts: string[] = [];
  if (onlyA.length) parts.push(`only in "${labelA}": ${onlyA.join(", ")}`);
  if (onlyB.length) parts.push(`only in "${labelB}": ${onlyB.join(", ")}`);
  return `Tools differ between "${labelA}" and "${labelB}" — ${parts.join("; ")}.`;
}
