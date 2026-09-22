// Period selection for the Team Stats dashboard. Pure and isomorphic: the
// server parses the request's search params into a concrete window, and the
// client uses the same presets to build those params. Everything is computed
// in UTC so day/hour buckets line up with how timestamps are stored.

export type Granularity = "hour" | "day";

export const STATS_PRESETS = ["24h", "7d", "month"] as const;
export type StatsPreset = (typeof STATS_PRESETS)[number];

export type StatsRange = {
  preset: StatsPreset;
  fromISO: string;
  toISO: string;
  granularity: Granularity;
};

const HOUR = 3600_000;
const DAY = 86_400_000;

function isPreset(v: string | undefined): v is StatsPreset {
  return !!v && (STATS_PRESETS as readonly string[]).includes(v);
}

// Resolve the range search param into a concrete window. Falls back to the 24h
// preset for anything missing or unrecognized.
export function resolveStatsRange(
  params: { range?: string },
  now: Date = new Date(),
): StatsRange {
  const end = now.getTime();
  const preset: StatsPreset = isPreset(params.range) ? params.range : "24h";
  const span = preset === "24h" ? DAY : preset === "7d" ? 7 * DAY : 30 * DAY;
  return {
    preset,
    fromISO: new Date(end - span).toISOString(),
    toISO: new Date(end).toISOString(),
    granularity: preset === "24h" ? "hour" : "day",
  };
}

// The list of bucket boundaries (epoch ms, UTC) spanning [from, to), so charts
// can show empty buckets as gaps rather than skipping them.
export function enumerateBuckets(fromISO: string, toISO: string, g: Granularity): number[] {
  const step = g === "hour" ? HOUR : DAY;
  const start = Math.floor(Date.parse(fromISO) / step) * step;
  const end = Date.parse(toISO);
  const out: number[] = [];
  for (let t = start; t < end; t += step) out.push(t);
  return out;
}
