import "server-only";
import type { ServiceConnection } from "@prisma/client";
import { audit } from "@/lib/server/audit";
import { principalActor, type Principal } from "@/lib/server/mcp";
import { publicServiceConfig } from "@/lib/server/serviceConnections";
import { getServiceCredentials } from "@/lib/server/serviceOAuth";
import { selectionLabel, serviceTypeDef, type Selection } from "@/lib/isomorphic/serviceConnectionTypes";

// Helpers for exposing service connections (Google, QuickBooks) through the
// API credential tools (see apiCredentialTools.ts).

// "Google · Drive (read-only) · v@example.com"
export function describeServiceConnection(conn: ServiceConnection): string {
  const config = publicServiceConfig(conn);
  const extra = conn.type === "quickbooks" ? (config.realmId ? `realm ${config.realmId}` : null) : config.email;
  return [
    serviceTypeDef(conn.type)?.label ?? conn.type,
    conn.name,
    selectionLabel(conn.type, config.granted as Selection | undefined),
    extra,
  ]
    .filter(Boolean)
    .join(" · ");
}

// Live (refreshed) credentials for one connection. The reveal is audited.
export async function serviceCredentials(
  conn: ServiceConnection,
  ctx: { principal: Principal; ip?: string | null; userAgent?: string | null },
) {
  const creds = await getServiceCredentials(conn);
  await audit({
    ...principalActor(ctx.principal),
    action: "VIEW_SERVICE_CREDENTIAL",
    source: "MCP",
    teamId: conn.teamId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    details: { serviceConnectionId: conn.id, type: conn.type },
  });
  return creds;
}
