import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

// Compact "time ago" for timestamps. Returns null when absent/invalid.
export function timeAgo(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = dayjs(iso);
  return d.isValid() ? d.fromNow() : null;
}
