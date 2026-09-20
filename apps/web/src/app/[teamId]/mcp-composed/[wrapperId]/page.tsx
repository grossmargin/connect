import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userInTeam } from "@/lib/access";
import { isUuid } from "@/lib/ids";
import { EditComposed } from "./EditComposed";
import type { CredentialOption } from "../ComposedTable";

export default async function ComposedDetailPage({
  params,
}: {
  params: Promise<{ teamId: string; wrapperId: string }>;
}) {
  const { teamId, wrapperId } = await params;
  if (!isUuid(teamId) || !isUuid(wrapperId)) notFound();
  const user = await requireUser();
  if (!(await userInTeam(user.id, teamId))) notFound();

  const [wrapper, credentials] = await Promise.all([
    prisma.mcpWrapper.findUnique({
      where: { id: wrapperId },
      include: { credentials: { select: { id: true } } },
    }),
    prisma.credential.findMany({
      where: { vault: { teamId } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, vault: { select: { name: true } } },
    }),
  ]);
  if (!wrapper || wrapper.teamId !== teamId) notFound();

  const credentialOptions: CredentialOption[] = credentials.map((c) => ({
    id: c.id,
    name: c.name,
    vaultName: c.vault.name,
  }));

  return (
    <EditComposed
      teamId={teamId}
      wrapper={{
        id: wrapper.id,
        name: wrapper.name,
        slug: wrapper.slug,
        type: wrapper.type,
        credentialIds: wrapper.credentials.map((c) => c.id),
        lastTestOk: wrapper.lastTestOk,
        lastTestError: wrapper.lastTestError,
        lastTestedAt: wrapper.lastTestedAt?.toISOString() ?? null,
        updatedAt: wrapper.updatedAt.toISOString(),
      }}
      credentials={credentialOptions}
    />
  );
}
