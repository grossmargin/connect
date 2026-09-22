import { prisma } from "@/lib/server/db";
import { hashToken } from "@/lib/server/tokens";
import { decryptContent } from "@/lib/server/crypto";
import { audit } from "@/lib/server/audit";
import { fetchNangoToken, parseNangoRef } from "@/lib/server/nango";

// A resolved MCP caller. SA is scoped to one team; a user to all their teams.
export type Principal =
  | { kind: "sa"; serviceAccountId: string; teamIds: string[] }
  | { kind: "user"; userId: string; teamIds: string[] };

export function principalActor(p: Principal): { actorType: "SERVICE_ACCOUNT" | "USER"; actorId: string } {
  return p.kind === "sa"
    ? { actorType: "SERVICE_ACCOUNT", actorId: p.serviceAccountId }
    : { actorType: "USER", actorId: p.userId };
}

// Resolve a bearer token to a principal, or null if invalid.
export async function resolvePrincipal(token: string): Promise<Principal | null> {
  if (token.startsWith("sa_")) return resolveServiceAccount(token);
  return resolveOAuthUser(token);
}

async function resolveServiceAccount(token: string): Promise<Principal | null> {
  const key = await prisma.serviceAccountKey.findUnique({
    where: { hash: hashToken(token) },
    include: { serviceAccount: true },
  });
  if (!key || key.revokedAt) return null;
  await prisma.serviceAccountKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } });
  return { kind: "sa", serviceAccountId: key.serviceAccountId, teamIds: [key.serviceAccount.teamId] };
}

async function resolveOAuthUser(token: string): Promise<Principal | null> {
  const row = await prisma.oAuthToken.findUnique({ where: { accessTokenHash: hashToken(token) } });
  if (!row || row.revokedAt || row.accessExpiresAt < new Date()) return null;
  const memberships = await prisma.teamMembership.findMany({
    where: { userId: row.userId },
    select: { teamId: true },
  });
  return { kind: "user", userId: row.userId, teamIds: memberships.map((m) => m.teamId) };
}

// ---------- Tool data ----------

// Restricts credential tools to a set of vaults (the bundle's selection). When
// omitted, every vault the principal can reach is in scope.
export type VaultFilter = { allowedVaultIds: string[] };

function vaultWhere(filter?: VaultFilter) {
  return filter ? { id: { in: filter.allowedVaultIds } } : {};
}

export async function getVaults(p: Principal, filter?: VaultFilter) {
  const vaults = await prisma.vault.findMany({
    where: { teamId: { in: p.teamIds }, ...vaultWhere(filter) },
    include: { team: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return vaults.map((v) => ({
    id: v.id,
    name: v.name,
    description: v.description,
    teamId: v.teamId,
    teamName: v.team.name,
  }));
}

export async function getCredentials(p: Principal, vaultId?: string, filter?: VaultFilter) {
  // Both narrow by vault: `vaultId` picks one, `filter` limits to the bundle's
  // set. When both are present the credential must satisfy each.
  const vaultConds = [
    ...(vaultId ? [{ vaultId }] : []),
    ...(filter ? [{ vaultId: { in: filter.allowedVaultIds } }] : []),
  ];
  const creds = await prisma.credential.findMany({
    where: {
      vault: { teamId: { in: p.teamIds } },
      ...(vaultConds.length ? { AND: vaultConds } : {}),
    },
    include: { vault: { select: { name: true, teamId: true } } },
    orderBy: { name: "asc" },
  });
  return creds.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    type: c.type,
    vaultId: c.vaultId,
    vaultName: c.vault.name,
  }));
}

// Decrypts and audits. Returns null if out of scope / not found.
export async function viewCredential(
  p: Principal,
  credentialId: string,
  ctx: { ip?: string | null; userAgent?: string | null },
  filter?: VaultFilter,
) {
  const cred = await prisma.credential.findUnique({
    where: { id: credentialId },
    include: { vault: { select: { teamId: true } } },
  });
  if (!cred || !p.teamIds.includes(cred.vault.teamId)) return null;
  if (filter && !filter.allowedVaultIds.includes(cred.vaultId)) return null;

  // Reveal is the audited event, whether the value is stored or fetched live.
  await audit({
    ...principalActor(p),
    action: "VIEW_CREDENTIAL",
    source: "MCP",
    teamId: cred.vault.teamId,
    vaultId: cred.vaultId,
    credentialId: cred.id,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  const base = {
    id: cred.id,
    name: cred.name,
    description: cred.description,
    type: cred.type,
    vaultId: cred.vaultId,
  };

  if (cred.type === "NANGO") {
    const ref = parseNangoRef(cred.credentialRef);
    if (!ref) throw new Error("Nango credential is missing connectionId/providerConfigKey");
    const token = await fetchNangoToken(ref);
    return { ...base, content: token.accessToken, realmId: token.realmId, expiresAt: token.expiresAt };
  }

  const content = decryptContent(Buffer.from(cred.content!));
  return { ...base, content: content.value };
}
