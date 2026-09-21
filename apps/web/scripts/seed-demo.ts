// Throwaway demo data for README screenshots. Uses fake company names only.
// Creates a team "Acme" with the permanent-login user as member, then fake
// connections and a Published MCP with individual members and groups.
// Tear down with: bun run scripts/seed-demo.ts --drop
import { prisma } from "../src/lib/db";
import { encryptContent } from "../src/lib/crypto";

const EMAIL = process.env.__USAFE_PERMANENT_LOGIN ?? "vladimir@grossmargin.io";
const SLUG = "acme";

async function drop() {
  await prisma.team.deleteMany({ where: { slug: SLUG } });
  console.log(`Dropped demo team "${SLUG}".`);
}

async function main() {
  await drop(); // fresh each run

  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`No user ${EMAIL}; sign in once first.`);

  const team = await prisma.team.create({ data: { name: "Acme", slug: SLUG } });
  await prisma.teamMembership.create({ data: { userId: user.id, teamId: team.id } });

  // Vaults + credentials (fake values).
  const vault = async (name: string, description: string, secrets: number) => {
    const v = await prisma.vault.create({ data: { teamId: team.id, name, description } });
    for (let i = 0; i < secrets; i++) {
      await prisma.credential.create({
        data: {
          vaultId: v.id,
          name: `${name} secret ${i + 1}`,
          type: "SINGLELINE",
          content: encryptContent({ value: "demo-value" }),
        },
      });
    }
  };
  await vault("Bank account access", "Access to bank accounts", 1);
  await vault("Google Services Access", "Use credentials from this vault to access Google Drive files", 1);
  await vault("QuickBooks Access", "Access to customer QuickBooks", 3);

  const conn = async (name: string, slug: string, url: string) =>
    prisma.mcpConnection.create({
      data: { teamId: team.id, name, slug, url, authType: "DCR", status: "CONNECTED", lastConnectedAt: new Date() },
    });

  const deelN = await conn("Deel - Northwind Inc", "deel_northwind_inc", "https://api.letsdeel.com/mcp");
  const gustoG = await conn("Gusto - Globex Inc", "gusto_globex", "https://mcp.api.gusto.com");
  const mercuryG = await conn("Mercury - Globex Inc", "mercury_globex", "https://mcp.mercury.com");
  const rampA = await conn("Ramp - Aperture Labs", "ramp_aperture", "https://mcp.ramp.com");
  const rampG = await conn("Ramp - Globex Inc", "ramp_globex", "https://mcp.ramp.com");
  const rampN = await conn("Ramp - Northwind Inc", "ramp_northwind", "https://mcp.ramp.com");

  // Default Published MCP (team root): one group.
  const def = await prisma.mcpScope.create({
    data: { teamId: team.id, name: "Default", slug: "", isDefault: true },
  });
  await prisma.mcpGroup.create({
    data: {
      teamId: team.id,
      scopeId: def.id,
      name: "Ramp",
      slug: "ramp",
      tenants: { connect: [rampA, rampG, rampN].map((c) => ({ id: c.id })) },
    },
  });

  // A named Published MCP with both individual members and groups.
  const portal = await prisma.mcpScope.create({
    data: {
      teamId: team.id,
      name: "Client Portal",
      slug: "clients",
      connections: { connect: [gustoG, mercuryG].map((c) => ({ id: c.id })) },
    },
  });
  await prisma.mcpGroup.create({
    data: {
      teamId: team.id,
      scopeId: portal.id,
      name: "Ramp",
      slug: "ramp",
      tenants: { connect: [rampA, rampG, rampN].map((c) => ({ id: c.id })) },
    },
  });
  await prisma.mcpGroup.create({
    data: {
      teamId: team.id,
      scopeId: portal.id,
      name: "Deel",
      slug: "deel",
      tenants: { connect: [{ id: deelN.id }] },
    },
  });

  console.log(`Seeded demo team "${SLUG}". Portal scope id: ${portal.id}`);
}

const run = process.argv.includes("--drop") ? drop() : main();
run
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
