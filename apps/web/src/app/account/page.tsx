import { requireUser } from "@/lib/server/session";
import { userTeams, resolveUserTeamId } from "@/lib/server/team";
import { getDefaultTeamId } from "@/lib/server/userSettings";
import { AccountView, type AccountTeam } from "./AccountView";

export default async function AccountPage() {
  const user = await requireUser();
  const [teams, storedDefaultId, selectedTeamId] = await Promise.all([
    userTeams(user.id),
    getDefaultTeamId(user.id),
    resolveUserTeamId(user.id), // default, else oldest — the radio's initial pick
  ]);

  const options: AccountTeam[] = teams.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));

  return (
    <AccountView
      name={user.name ?? null}
      email={user.email ?? null}
      teams={options}
      storedDefaultId={storedDefaultId}
      selectedTeamId={selectedTeamId}
    />
  );
}
