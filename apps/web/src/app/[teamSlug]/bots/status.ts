import type { Tone } from "@/ui/components/StatusPill";

export type BotStatus = "CONNECTED" | "ERROR" | "PENDING";

export function botStatus(b: { webhookSecretHash: string | null; lastError: string | null }): BotStatus {
  if (b.lastError) return "ERROR";
  return b.webhookSecretHash ? "CONNECTED" : "PENDING";
}

export const BOT_STATUS_TAG: Record<BotStatus, { tone: Tone; label: string }> = {
  CONNECTED: { tone: "success", label: "Listening" },
  ERROR: { tone: "error", label: "Error" },
  PENDING: { tone: "default", label: "No webhook" },
};
