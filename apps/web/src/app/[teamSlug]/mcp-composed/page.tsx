import { prisma } from "@/lib/db";
import { requireTeam } from "@/lib/team";
import { ComposedTable, type WrapperRow, type CredentialOption } from "./ComposedTable";

export default async function McpComposedPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeam(teamSlug);
  const teamId = team.id;

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

  return <ComposedTable wrappers={rows} credentials={credentialOptions} />;
}
