import { prisma } from "@/lib/server/db";
import type { ActorType, AuditAction, AuditSource } from "@/lib/isomorphic/dbEnums";

type AuditInput = {
  actorType: ActorType;
  actorId: string;
  action: AuditAction;
  source: AuditSource;
  teamId?: string | null;
  vaultId?: string | null;
  credentialId?: string | null;
  connectionId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
};

export async function audit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({ data: input });
}
