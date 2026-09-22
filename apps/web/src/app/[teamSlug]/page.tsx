import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { getTeamBySlug } from "@/lib/server/team";
import { VaultsGrid } from "./VaultsGrid";

export default async function TeamHomePage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await getTeamBySlug(teamSlug);
  if (!team) notFound();

  const rows = await prisma.vault.findMany({
    where: { teamId: team.id },
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

  return <VaultsGrid vaults={vaults} />;
}
