export type Tone = "success" | "processing" | "default" | "error";

const TONE: Record<Tone, { pill: string; dot: string }> = {
  success: { pill: "bg-green-50 text-green-700", dot: "bg-green-500" },
  processing: { pill: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
  default: { pill: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
  error: { pill: "bg-red-50 text-red-700", dot: "bg-red-500" },
};

// Small pale pill with a leading status dot.
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  const c = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${c.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}
