import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { ComposedTable, type WrapperRow, type CredentialOption } from "./ComposedTable";

export default async function McpComposedPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  if (!isUuid(teamId)) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) notFound();

  const [wrappers, credentials] = await Promise.all([
    prisma.mcpWrapper.findMany({
      where: { teamId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        lastTestOk: true,
        lastTestedAt: true,
        _count: { select: { credentials: true } },
      },
    }),
    prisma.credential.findMany({
      where: { vault: { teamId } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, vault: { select: { name: true } } },
    }),
  ]);

  const rows: WrapperRow[] = wrappers.map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    type: w.type,
    credentialCount: w._count.credentials,
    lastTestOk: w.lastTestOk,
    lastTestedAt: w.lastTestedAt?.toISOString() ?? null,
  }));

  const credentialOptions: CredentialOption[] = credentials.map((c) => ({
    id: c.id,
    name: c.name,
    vaultName: c.vault.name,
  }));

  return <ComposedTable teamId={teamId} wrappers={rows} credentials={credentialOptions} />;
}
