import { requireTeamAdmin } from "@/lib/server/team";
import { checkTeamHealth } from "@/lib/server/connectionHealth";
import { ConnectionStatusesView } from "./ConnectionStatusesView";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Admin-only. Runs a live test of every MCP connection and NANGO credential on
// each load; MCP results are also saved to the DB.
export default async function ConnectionStatusesPage({ params }: { params: Promise<{ teamSlug: string }> }) {
  const { teamSlug } = await params;
  const team = await requireTeamAdmin(teamSlug);
  const health = await checkTeamHealth(team.id);
  return <ConnectionStatusesView teamSlug={teamSlug} health={health} />;
}
