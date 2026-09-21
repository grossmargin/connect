"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { userCanAccessVault, userInTeam } from "@/lib/access";
import { encryptContent, decryptContent } from "@/lib/crypto";
import { generateServiceAccountKey } from "@/lib/tokens";
import { audit } from "@/lib/audit";
import { fetchNangoToken, parseNangoRef, NangoError } from "@/lib/nango";
import { Prisma } from "@prisma/client";
import type { CredentialType } from "@/lib/dbEnums";

// Builds the content/credentialRef pair for a credential of the given type.
// NANGO stores a pointer, not a secret; the others store an encrypted value.
function credentialData(type: CredentialType, formData: FormData): {
  content?: Uint8Array<ArrayBuffer> | null;
  credentialRef?: Prisma.InputJsonValue | null;
} {
  if (type === "NANGO") {
    const connectionId = String(formData.get("connectionId") ?? "").trim();
    const providerConfigKey = String(formData.get("providerConfigKey") ?? "").trim();
    return { content: null, credentialRef: { connectionId, providerConfigKey } };
  }
  const value = formData.get("value");
  if (value === null || value === "") return {};
  return { content: encryptContent({ value: String(value) }), credentialRef: null };
}

async function reqCtx() {
  const h = await headers();
  return { ip: h.get("x-forwarded-for"), userAgent: h.get("user-agent") };
}

export async function createCredential(vaultId: string, formData: FormData) {
  const user = await requireUser();
  if (!(await userCanAccessVault(user.id, vaultId))) return;

  const vault = await prisma.vault.findUnique({ where: { id: vaultId }, select: { teamId: true } });
  if (!vault) return;

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = (String(formData.get("type") ?? "SINGLELINE") as CredentialType);
  if (!name) return;

  const { content, credentialRef } = credentialData(type, formData);
  const cred = await prisma.credential.create({
    data: {
      vaultId,
      name,
      description: description || null,
      type,
      content: content ?? (type === "NANGO" ? null : encryptContent({ value: "" })),
      credentialRef: credentialRef ?? undefined,
      createdById: user.id,
      updatedById: user.id,
    },
  });
  await audit({
    actorType: "USER",
    actorId: user.id,
    action: "CREATE_CREDENTIAL",
    source: "UI",
    teamId: vault.teamId,
    vaultId,
    credentialId: cred.id,
    ...(await reqCtx()),
  });
  revalidatePath(`/${vault.teamId}/vaults/${vaultId}`);
}

export async function updateCredential(credentialId: string, formData: FormData) {
  const user = await requireUser();
  const cred = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { vault: { select: { id: true, teamId: true } } },
  });
  if (!cred || !(await userInTeam(user.id, cred.vault.teamId))) return;

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? cred.type) as CredentialType;

  // NANGO: replace the pointer. Others: re-encrypt only when a new value is supplied.
  const { content, credentialRef } = credentialData(type, formData);
  await prisma.credential.update({
    where: { id: credentialId },
    data: {
      name: name || cred.name,
      description: description || null,
      type,
      updatedById: user.id,
      ...(content !== undefined ? { content } : {}),
      ...(credentialRef !== undefined ? { credentialRef: credentialRef ?? Prisma.DbNull } : {}),
    },
  });
  await audit({
    actorType: "USER",
    actorId: user.id,
    action: "UPDATE_CREDENTIAL",
    source: "UI",
    teamId: cred.vault.teamId,
    vaultId: cred.vault.id,
    credentialId,
    ...(await reqCtx()),
  });
  revalidatePath(`/${cred.vault.teamId}/vaults/${cred.vault.id}`);
}

export async function deleteCredential(credentialId: string): Promise<{ error: string } | void> {
  const user = await requireUser();
  const cred = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { vault: { select: { id: true, teamId: true } } },
  });
  if (!cred || !(await userInTeam(user.id, cred.vault.teamId))) return { error: "not found" };

  await prisma.credential.delete({ where: { id: credentialId } });
  await audit({
    actorType: "USER",
    actorId: user.id,
    action: "DELETE_CREDENTIAL",
    source: "UI",
    teamId: cred.vault.teamId,
    vaultId: cred.vault.id,
    credentialId,
    ...(await reqCtx()),
  });
  revalidatePath(`/${cred.vault.teamId}/vaults/${cred.vault.id}`);
}

export async function updateVault(
  teamId: string,
  vaultId: string,
  name: string,
  description: string,
): Promise<{ error: string } | void> {
  const user = await requireUser();
  const vault = await prisma.vault.findUnique({ where: { id: vaultId }, select: { teamId: true } });
  if (!vault || vault.teamId !== teamId || !(await userInTeam(user.id, teamId))) return { error: "not found" };
  if (!name.trim()) return { error: "name required" };

  await prisma.vault.update({
    where: { id: vaultId },
    data: { name: name.trim(), description: description.trim() || null },
  });
  revalidatePath(`/${teamId}/vaults/${vaultId}`);
  revalidatePath(`/${teamId}`);
}

// Deletes the vault and, by cascade, every credential in it.
export async function deleteVault(
  teamId: string,
  vaultId: string,
): Promise<{ error: string } | void> {
  const user = await requireUser();
  const vault = await prisma.vault.findUnique({ where: { id: vaultId }, select: { teamId: true } });
  if (!vault || vault.teamId !== teamId || !(await userInTeam(user.id, teamId))) return { error: "not found" };

  await prisma.vault.delete({ where: { id: vaultId } });
  revalidatePath(`/${teamId}`);
}

// Reveal is the audited event.
export async function revealCredential(credentialId: string): Promise<{ value: string } | { error: string }> {
  const user = await requireUser();
  const cred = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { vault: { select: { id: true, teamId: true } } },
  });
  if (!cred || !(await userInTeam(user.id, cred.vault.teamId))) return { error: "not found" };

  let value: string;
  if (cred.type === "NANGO") {
    const ref = parseNangoRef(cred.credentialRef);
    if (!ref) return { error: "Nango credential is missing connectionId/providerConfigKey" };
    try {
      const token = await fetchNangoToken(ref);
      value = JSON.stringify({ accessToken: token.accessToken, realmId: token.realmId }, null, 2);
    } catch (e) {
      return { error: e instanceof NangoError ? e.message : "Failed to fetch token from Nango" };
    }
  } else {
    value = decryptContent(Buffer.from(cred.content!)).value;
  }

  await audit({
    actorType: "USER",
    actorId: user.id,
    action: "VIEW_CREDENTIAL",
    source: "UI",
    teamId: cred.vault.teamId,
    vaultId: cred.vault.id,
    credentialId,
    ...(await reqCtx()),
  });
  return { value };
}

export async function createServiceAccount(
  vaultId: string,
  name: string,
  keyCount: number,
): Promise<{ error: string } | { id: string; keys: string[] }> {
  const user = await requireUser();
  const vault = await prisma.vault.findUnique({ where: { id: vaultId }, select: { teamId: true } });
  if (!vault || !(await userInTeam(user.id, vault.teamId))) return { error: "not found" };
  if (!name.trim()) return { error: "name required" };

  const count = Math.min(Math.max(keyCount, 1), 10);
  const sa = await prisma.serviceAccount.create({
    data: { teamId: vault.teamId, name: name.trim(), createdById: user.id },
  });
  const raws: string[] = [];
  for (let i = 0; i < count; i++) {
    const k = generateServiceAccountKey();
    raws.push(k.raw);
    await prisma.serviceAccountKey.create({
      data: { serviceAccountId: sa.id, hash: k.hash, prefix: k.prefix },
    });
  }
  revalidatePath(`/vaults/${vaultId}`);
  return { id: sa.id, keys: raws };
}

export async function addServiceAccountKey(
  serviceAccountId: string,
): Promise<{ error: string } | { key: string }> {
  const user = await requireUser();
  const sa = await prisma.serviceAccount.findUnique({ where: { id: serviceAccountId } });
  if (!sa || !(await userInTeam(user.id, sa.teamId))) return { error: "not found" };

  const k = generateServiceAccountKey();
  await prisma.serviceAccountKey.create({
    data: { serviceAccountId, hash: k.hash, prefix: k.prefix },
  });
  revalidatePath(`/vaults`);
  return { key: k.raw };
}

export async function revokeServiceAccountKey(keyId: string) {
  const user = await requireUser();
  const key = await prisma.serviceAccountKey.findUnique({
    where: { id: keyId },
    include: { serviceAccount: { select: { teamId: true } } },
  });
  if (!key || !(await userInTeam(user.id, key.serviceAccount.teamId))) return;
  await prisma.serviceAccountKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
  revalidatePath(`/vaults`);
}
