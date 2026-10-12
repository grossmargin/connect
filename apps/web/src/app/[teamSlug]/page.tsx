import { notFound } from "next/navigation";
import { prisma } from "@/lib/server/db";
import { getTeamBySlug } from "@/lib/server/team";
import type { CredentialType } from "@/lib/isomorphic/dbEnums";
import { CredentialsList } from "./CredentialsList";

export default async function TeamHomePage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await getTeamBySlug(teamSlug);
  if (!team) notFound();

  // All team credentials in one list; the vault each row sits in is ignored.
  const rows = await prisma.credential.findMany({
    where: { vault: { teamId: team.id } },
    orderBy: { name: "asc" },
  });

  return (
    <CredentialsList
      credentials={rows.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type as CredentialType,
        credentialRef: (c.credentialRef as { connectionId?: string; providerConfigKey?: string } | null) ?? null,
      }))}
    />
  );
}
