import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { isUuid } from "@/lib/ids";
import { requireTeam } from "@/lib/team";
import type { CredentialType } from "@/lib/dbEnums";
import { VaultView } from "./VaultView";

export default async function VaultPage({
  params,
}: {
  params: Promise<{ teamSlug: string; vaultId: string }>;
}) {
  const { teamSlug, vaultId } = await params;
  if (!isUuid(vaultId)) notFound();
  const team = await requireTeam(teamSlug);

  const vault = await prisma.vault.findUnique({
    where: { id: vaultId },
    include: { credentials: { orderBy: { name: "asc" } } },
  });
  if (!vault || vault.teamId !== team.id) notFound();

  return (
    <VaultView
      vaultId={vault.id}
      name={vault.name}
      description={vault.description}
      credentials={vault.credentials.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        type: c.type as CredentialType,
        credentialRef:
          (c.credentialRef as { connectionId?: string; providerConfigKey?: string } | null) ?? null,
      }))}
    />
  );
}
