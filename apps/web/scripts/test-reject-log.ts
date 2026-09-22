// Verifies that a tools/call rejected at the root (team_ambiguous) is logged.
// Puts the user in 2 teams, mints a user OAuth token, calls the root endpoint,
// asserts 409 + a McpCallLog row, then cleans everything up.
//   bun run scripts/test-reject-log.ts [rootUrl]
import { prisma } from "../src/lib/db";
import { hashToken } from "../src/lib/tokens";
import { randomBytes } from "node:crypto";

const ROOT = process.argv[2] ?? "http://localhost:3069/";
const EMAIL = process.env.__USAFE_PERMANENT_LOGIN ?? "vladimir@grossmargin.io";

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`no user ${EMAIL}`);

  // Ensure the user is in a second team.
  const team2 = await prisma.team.create({ data: { name: "RejectTest", slug: "rejecttest" } });
  await prisma.teamMembership.create({ data: { userId: user.id, teamId: team2.id } });

  // A throwaway OAuth client + user token.
  const client = await prisma.oAuthClient.create({
    data: { clientId: `test_${randomBytes(6).toString("hex")}`, redirectUris: [], grantTypes: [], name: "reject-test" },
  });
  const raw = `usr_${randomBytes(32).toString("base64url")}`;
  const token = await prisma.oAuthToken.create({
    data: {
      accessTokenHash: hashToken(raw),
      clientId: client.clientId,
      userId: user.id,
      accessExpiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const before = await prisma.mcpCallLog.count({ where: { toolName: "org_get", ok: false } });
  try {
    const res = await fetch(ROOT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${raw}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "org_get", arguments: { tenant: "deel_pearmill_inc" } },
      }),
    });
    const text = await res.text();
    console.log(`HTTP ${res.status}: ${text.slice(0, 160)}`);

    // Give the best-effort log write a moment.
    await new Promise((r) => setTimeout(r, 400));
    const row = await prisma.mcpCallLog.findFirst({
      where: { toolName: "org_get", ok: false, actorId: user.id },
      orderBy: { createdAt: "desc" },
    });
    const after = await prisma.mcpCallLog.count({ where: { toolName: "org_get", ok: false } });
    console.log(`log rows (org_get, !ok): ${before} -> ${after}`);
    if (row) console.log("logged:", JSON.stringify({ source: row.source, tenant: row.tenant, args: row.args, error: row.error }));
    console.log(res.status === 409 && after > before ? "\nPASS" : "\nFAIL");
  } finally {
    await prisma.oAuthToken.delete({ where: { id: token.id } }).catch(() => {});
    await prisma.oAuthClient.delete({ where: { id: client.id } }).catch(() => {});
    await prisma.team.delete({ where: { id: team2.id } }).catch(() => {});
    // Remove the test log row(s) we just created for this user.
    await prisma.mcpCallLog.deleteMany({ where: { toolName: "org_get", actorId: user.id, teamId: null } }).catch(() => {});
    console.log("(cleaned up test team, token, client, log rows)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
