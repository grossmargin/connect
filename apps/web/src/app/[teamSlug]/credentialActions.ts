"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userInTeam } from "@/lib/server/access";
import { encryptContent, decryptContent } from "@/lib/server/crypto";
import { audit } from "@/lib/server/audit";
import { fetchNangoToken, parseNangoRef, NangoError } from "@/lib/server/nango";
import { Prisma } from "@prisma/client";
import { isUuid } from "@/lib/isomorphic/ids";
import type { CredentialType } from "@/lib/isomorphic/dbEnums";

// Credentials are a flat team-wide list. Each row still lives in a vault in the
// DB (Credential.vaultId is required), but vaults are no longer shown or used
// for access; new credentials go to the team's oldest vault.

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

async function revalidateTeam(teamId: string) {
  const t = await prisma.team.findUnique({ where: { id: teamId }, select: { slug: true } });
  if (t) revalidatePath(`/${t.slug}`);
}

// The vault new credentials are stored in: the team's oldest, created on first use.
async function storageVaultId(teamId: string): Promise<string> {
  const v = await prisma.vault.findFirst({ where: { teamId }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (v) return v.id;
  return (await prisma.vault.create({ data: { teamId, name: "Credentials" } })).id;
}

// Loads a credential the current user may manage, or null.
async function ownedCredential(credentialId: string) {
  const user = await requireUser();
  if (!isUuid(credentialId)) return null;
  const cred = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { vault: { select: { id: true, teamId: true } } },
  });
  if (!cred || !(await userInTeam(user.id, cred.vault.teamId))) return null;
  return { user, cred };
}

export async function createCredential(teamId: string, formData: FormData) {
  const user = await requireUser();
  if (!isUuid(teamId) || !(await userInTeam(user.id, teamId))) return;

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const type = String(formData.get("type") ?? "SINGLELINE") as CredentialType;
  if (!name) return;

  const vaultId = await storageVaultId(teamId);
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
    teamId,
    vaultId,
    credentialId: cred.id,
    ...(await reqCtx()),
  });
  await revalidateTeam(teamId);
}

export async function updateCredential(credentialId: string, formData: FormData) {
  const owned = await ownedCredential(credentialId);
  if (!owned) return;
  const { user, cred } = owned;

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
  await revalidateTeam(cred.vault.teamId);
}

export async function deleteCredential(credentialId: string): Promise<{ error: string } | void> {
  const owned = await ownedCredential(credentialId);
  if (!owned) return { error: "not found" };
  const { user, cred } = owned;

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
  await revalidateTeam(cred.vault.teamId);
}

// Reveal is the audited event.
export async function revealCredential(credentialId: string): Promise<{ value: string } | { error: string }> {
  const owned = await ownedCredential(credentialId);
  if (!owned) return { error: "not found" };
  const { user, cred } = owned;

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
