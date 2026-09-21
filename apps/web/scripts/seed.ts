import { prisma } from "../src/lib/db";
import { encryptContent } from "../src/lib/crypto";
import { generateServiceAccountKey } from "../src/lib/tokens";

async function main() {
  const team = await prisma.team.create({ data: { name: "Acme", slug: "acme" } });
  const user = await prisma.user.create({ data: { email: "v@grossmargin.io", name: "V" } });
  await prisma.teamMembership.create({ data: { userId: user.id, teamId: team.id } });

  const vault = await prisma.vault.create({
    data: { teamId: team.id, name: "Prod", description: "Production secrets" },
  });
  const cred = await prisma.credential.create({
    data: {
      vaultId: vault.id,
      name: "DB password",
      description: "Postgres",
      type: "SINGLELINE",
      content: encryptContent({ value: "hunter2" }),
    },
  });

  const sa = await prisma.serviceAccount.create({ data: { teamId: team.id, name: "ci-bot" } });
  const key = generateServiceAccountKey();
  await prisma.serviceAccountKey.create({
    data: { serviceAccountId: sa.id, hash: key.hash, hint: key.hint },
  });

  console.log(JSON.stringify({ teamId: team.id, vaultId: vault.id, credentialId: cred.id, saKey: key.raw }));
}

main().finally(() => prisma.$disconnect());
