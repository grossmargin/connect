import { prisma } from "@/lib/server/db";
import { requireUser } from "@/lib/server/session";
import { userTeamIds } from "@/lib/server/access";
import { getNangoConnectionInfo, isQuickbooksProvider, parseNangoRef } from "@/lib/server/nango";
import { DisconnectList, type QbRow } from "./DisconnectList";

// QuickBooks disconnect page — required for Intuit app review. Lists every
// credential that points at a QuickBooks Nango connection and lets the user
// disconnect it. We ask Nango for each connection's real provider (by
// connectionId, not the stored provider config key) to decide what's QuickBooks.
export default async function QuickbooksDisconnectPage() {
  const user = await requireUser();
  const teamIds = await userTeamIds(user.id);

  const creds = await prisma.credential.findMany({
    where: { type: "NANGO", vault: { teamId: { in: teamIds } } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      credentialRef: true,
      vault: { select: { name: true, team: { select: { name: true } } } },
    },
  });

  const rows: QbRow[] = (
    await Promise.all(
      creds.map(async (c): Promise<QbRow | null> => {
        const ref = parseNangoRef(c.credentialRef);
        if (!ref) return null;

        const base = {
          id: c.id,
          name: c.name,
          vaultName: c.vault.name,
          teamName: c.vault.team.name,
          connectionId: ref.connectionId,
        };

        // Ask Nango what this connection actually is. If Nango is unreachable we
        // still list it (marked unverified) so a broken connection can be
        // disconnected — we just can't confirm the provider.
        try {
          const info = await getNangoConnectionInfo(ref.connectionId);
          if (!info) return { ...base, provider: null, status: "missing" };
          if (!isQuickbooksProvider(info.provider)) return null;
          return { ...base, provider: info.provider, status: "connected" };
        } catch {
          return { ...base, provider: null, status: "unverified" };
        }
      }),
    )
  ).filter((r): r is QbRow => r !== null);

  return <DisconnectList rows={rows} />;
}
