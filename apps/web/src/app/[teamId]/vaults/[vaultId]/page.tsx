import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import type { CredentialType } from "@/lib/dbEnums";
import { VaultView } from "./VaultView";

export default async function VaultPage({
  params,
}: {
  params: Promise<{ teamId: string; vaultId: string }>;
}) {
  const { teamId, vaultId } = await params;
  if (!isUuid(teamId) || !isUuid(vaultId)) notFound();
  const user = await requireUser();

  const vault = await prisma.vault.findUnique({
    where: { id: vaultId },
    include: { credentials: { orderBy: { name: "asc" } } },
  });
  if (!vault || vault.teamId !== teamId || !(await userInTeam(user.id, teamId))) notFound();

  return (
    <VaultView
      teamId={teamId}
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
