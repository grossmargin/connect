"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userCanAccessVault } from "@/lib/server/access";

// Disconnect a QuickBooks connection by deleting the credential that references
// it. The app can no longer use the connection afterwards. Scoped to the signed-
// in user's teams.
export async function disconnectQuickbooks(
  credentialId: string,
): Promise<{ error: string } | { ok: true }> {
  const user = await requireUser();

  const cred = await prisma.credential.findUnique({
    where: { id: credentialId },
    select: { vaultId: true },
  });
  if (!cred) return { error: "not found" };
  if (!(await userCanAccessVault(user.id, cred.vaultId))) return { error: "not found" };

  await prisma.credential.delete({ where: { id: credentialId } });
  revalidatePath("/quickbooks-disconnect");
  return { ok: true };
}
