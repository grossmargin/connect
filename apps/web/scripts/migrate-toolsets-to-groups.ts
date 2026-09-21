// One-time migration: turn each federated toolset published on a scope into a
// group inside that Published MCP. Tool names are preserved (prefix + tenant
// argument unchanged). Idempotent — skips a group that already exists.
//
// Run with the web app's env, e.g.:  bun run scripts/migrate-toolsets-to-groups.ts
import { prisma } from "../src/lib/db";

async function main() {
  const scopes = await prisma.mcpScope.findMany({
    include: {
      groups: { select: { slug: true } },
      toolsets: { include: { connections: { select: { id: true } } } },
    },
  });

  let created = 0;
  let skipped = 0;
  for (const scope of scopes) {
    const existing = new Set(scope.groups.map((g) => g.slug));
    for (const ts of scope.toolsets) {
      if (existing.has(ts.slug)) {
        skipped++;
        continue;
      }
      await prisma.mcpGroup.create({
        data: {
          teamId: scope.teamId,
          scopeId: scope.id,
          name: ts.name,
          slug: ts.slug,
          tenants: { connect: ts.connections.map((c) => ({ id: c.id })) },
        },
      });
      existing.add(ts.slug);
      created++;
    }
  }

  console.log(`Migration done. Groups created: ${created}, skipped (already present): ${skipped}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
