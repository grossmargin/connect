import { prisma } from "@/lib/db";
import { VaultsGrid } from "./VaultsGrid";

export default async function TeamHomePage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const rows = await prisma.vault.findMany({
    where: { teamId },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      updatedAt: true,
      _count: { select: { credentials: true } },
    },
  });

  const vaults = rows.map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description,
    secretCount: v._count.credentials,
    updatedAt: v.updatedAt.toISOString(),
  }));

  return <VaultsGrid teamId={teamId} vaults={vaults} />;
}
