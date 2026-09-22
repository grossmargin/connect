// Live smoke test for a Published MCP endpoint. Mints a temporary service-
// account key, connects, lists tools, and calls each group's *_tenants helper,
// then revokes the key. Read-only.
//
//   bun run scripts/test-endpoint.ts <endpoint-url> [serviceAccountId]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { prisma } from "../src/lib/db";
import { generateServiceAccountKey } from "../src/lib/tokens";

const ENDPOINT = process.argv[2];
const SA_ID = process.argv[3] ?? "b5fb9ff4-9f51-465e-8c1f-5174fe249108";
if (!ENDPOINT) throw new Error("usage: test-endpoint.ts <url> [serviceAccountId]");

async function main() {
  const { raw, hash, hint } = generateServiceAccountKey();
  const key = await prisma.serviceAccountKey.create({
    data: { serviceAccountId: SA_ID, hash, hint },
  });
  try {
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      requestInit: { headers: { Authorization: `Bearer ${raw}` } },
    });
    const client = new Client({ name: "endpoint-smoke-test", version: "0.0.1" });
    await client.connect(transport);

    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    console.log(`\nTOOLS (${names.length}):`);
    for (const n of names) console.log(`  ${n}`);

    // Call each group's *_tenants helper (local, no upstream side effects).
    const tenantTools = names.filter((n) => n.endsWith("__tenants"));
    for (const t of tenantTools) {
      const res = await client.callTool({ name: t, arguments: {} });
      const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
      const text = content.map((c) => (c.type === "text" ? c.text : `[${c.type}]`)).join("");
      console.log(`\n${t} ->`, text);
    }

    await client.close();
    console.log("\nOK");
  } finally {
    await prisma.serviceAccountKey.delete({ where: { id: key.id } }).catch(() => {});
    console.log(`(revoked temp key ${hint})`);
  }
}

main()
  .catch((e) => {
    console.error("FAILED:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
