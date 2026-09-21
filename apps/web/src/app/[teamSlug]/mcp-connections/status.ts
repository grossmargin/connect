import type { Tone } from "../../StatusPill";

export type ConnectionStatus = "PENDING" | "REGISTERED" | "CONNECTED" | "ERROR";

export const STATUS_TAG: Record<ConnectionStatus, { color: string; label: string; tone: Tone }> = {
  PENDING: { color: "default", label: "Pending", tone: "default" },
  REGISTERED: { color: "blue", label: "Registered", tone: "processing" },
  CONNECTED: { color: "green", label: "Connected", tone: "success" },
  ERROR: { color: "red", label: "Error", tone: "error" },
};
