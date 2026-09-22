import { requireTeamAdmin } from "@/lib/server/team";
import { getTeamStats } from "@/lib/server/stats";
import { resolveStatsRange } from "@/lib/isomorphic/statsRange";
import { StatsView } from "./StatsView";

// Admin-only usage dashboard. requireTeamAdmin 404s non-admin members, so the
// page is unreachable for them even by direct URL.
export default async function TeamStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamSlug: string }>;
  searchParams: Promise<{ range?: string; from?: string; to?: string; user?: string }>;
}) {
  const { teamSlug } = await params;
  const team = await requireTeamAdmin(teamSlug);

  const sp = await searchParams;
  const range = resolveStatsRange(sp);
  const stats = await getTeamStats(team.id, range, sp.user || null);

  return <StatsView teamName={team.name} stats={stats} />;
}
