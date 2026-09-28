import { z } from "zod";

// What an agent watches. The shape depends on its bot's platform.

// telegram: one entry per @username, @groupname or chat id.
export const telegramAgentContext = z.object({
  watch: z.array(z.string()).default([]),
});
export type TelegramAgentContext = z.infer<typeof telegramAgentContext>;

// Trims and drops blanks and duplicates.
export function normalizeTelegramContext(raw: unknown): TelegramAgentContext {
  const ctx = telegramAgentContext.parse(raw ?? {});
  return { watch: [...new Set(ctx.watch.map((x) => x.trim()).filter(Boolean))] };
}

// Textarea text <-> entries: one per line; commas and spaces also separate.
export function parseWatchText(text: string): string[] {
  return text.split(/[\s,]+/).filter(Boolean);
}
