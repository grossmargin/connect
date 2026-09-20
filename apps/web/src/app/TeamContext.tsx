"use client";

import { createContext, useContext } from "react";

export type CurrentTeam = { teamId: string; teamName: string };

const TeamContext = createContext<CurrentTeam | null>(null);

export function TeamProvider({ team, children }: { team: CurrentTeam; children: React.ReactNode }) {
  return <TeamContext.Provider value={team}>{children}</TeamContext.Provider>;
}

// Current team from the /[teamId] route. Assumes one team per user for now;
// a team selector will set this later.
export function useCurrentTeam(): CurrentTeam {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error("useCurrentTeam must be used within a TeamProvider");
  return ctx;
}
