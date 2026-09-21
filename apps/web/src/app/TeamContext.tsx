"use client";

import { createContext, useContext } from "react";

// teamId is the uuid (for server-action args and DB scope); teamSlug is the
// public id used in URLs.
export type CurrentTeam = { teamId: string; teamSlug: string; teamName: string };

const TeamContext = createContext<CurrentTeam | null>(null);

export function TeamProvider({ team, children }: { team: CurrentTeam; children: React.ReactNode }) {
  return <TeamContext.Provider value={team}>{children}</TeamContext.Provider>;
}

// Current team from the /[teamSlug] route. Provided by AppShell, so any client
// component rendered under a team page can read it.
export function useCurrentTeam(): CurrentTeam {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useCurrentTeam must be used within a TeamProvider");
  return ctx;
}
