import { createHmac, timingSafeEqual } from "crypto";
import { serverEnv } from "@/lib/server/serverEnv";

// ---------- Auth ----------
//
// Intake keys are presented as `Authorization: Bearer <key>` (or `x-api-key`).
// We never store raw keys; the env holds HMAC-SHA256(key, salt) hex hashes.
// Keys are global — a valid key authenticates for any team.

function intakeSalt(): string {
  return serverEnv.CLAUDE_OTLP_INTAKE_SALT ?? serverEnv.AUTH_SECRET ?? "";
}

export function hashIntakeKey(raw: string): string {
  return createHmac("sha256", intakeSalt()).update(raw).digest("hex");
}

export function extractKey(req: Request): string | null {
  const authz = req.headers.get("authorization");
  if (authz && authz.startsWith("Bearer ")) return authz.slice(7).trim();
  const xk = req.headers.get("x-api-key");
  return xk ? xk.trim() : null;
}

export function verifyIntakeKey(raw: string): boolean {
  if (!intakeSalt()) return false; // misconfigured: refuse rather than accept all
  const allowed = (serverEnv.CLAUDE_OTLP_INTAKE_KEYS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return false;

  const h = hashIntakeKey(raw);
  const hBuf = Buffer.from(h);
  return allowed.some((a) => a.length === h.length && timingSafeEqual(Buffer.from(a), hBuf));
}

// ---------- OTLP/JSON flattening ----------
//
// OTLP/HTTP JSON nests resource -> scope -> leaf records. We emit one row per
// leaf (span or log record), keeping the raw leaf in `record`.

export type OtlpRow = {
  signalType: "trace" | "log";
  timeUnixNano: bigint | null;
  name: string | null;
  traceId: string | null;
  spanId: string | null;
  severity: string | null;
  resource: unknown;
  scope: unknown | null;
  record: unknown;
};

// OTLP/JSON encodes uint64 (timestamps) as decimal strings (protojson).
function toBigInt(v: unknown): bigint | null {
  if (typeof v === "string" && /^\d+$/.test(v)) {
    try {
      return BigInt(v);
    } catch {
      return null;
    }
  }
  if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.trunc(v));
  return null;
}

type KeyValue = { key?: string; value?: Record<string, unknown> };

function attrString(attrs: unknown, key: string): string | null {
  if (!Array.isArray(attrs)) return null;
  for (const a of attrs as KeyValue[]) {
    if (a?.key === key) {
      const sv = a.value?.stringValue;
      return typeof sv === "string" ? sv : null;
    }
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenSignal(signal: string, payload: any): OtlpRow[] {
  if (signal === "traces") return flattenTraces(payload);
  if (signal === "logs") return flattenLogs(payload);
  return []; // metrics: acknowledged, not stored
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenTraces(payload: any): OtlpRow[] {
  const out: OtlpRow[] = [];
  for (const rs of payload?.resourceSpans ?? []) {
    const resource = rs?.resource?.attributes ?? [];
    for (const ss of rs?.scopeSpans ?? []) {
      const scope = ss?.scope ?? null;
      for (const span of ss?.spans ?? []) {
        out.push({
          signalType: "trace",
          timeUnixNano: toBigInt(span?.startTimeUnixNano),
          name: str(span?.name),
          traceId: str(span?.traceId),
          spanId: str(span?.spanId),
          severity: null,
          resource,
          scope,
          record: span,
        });
      }
    }
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenLogs(payload: any): OtlpRow[] {
  const out: OtlpRow[] = [];
  for (const rl of payload?.resourceLogs ?? []) {
    const resource = rl?.resource?.attributes ?? [];
    for (const sl of rl?.scopeLogs ?? []) {
      const scope = sl?.scope ?? null;
      for (const log of sl?.logRecords ?? []) {
        out.push({
          signalType: "log",
          timeUnixNano: toBigInt(log?.timeUnixNano ?? log?.observedTimeUnixNano),
          name: attrString(log?.attributes, "event.name"),
          traceId: str(log?.traceId),
          spanId: str(log?.spanId),
          severity: str(log?.severityText),
          resource,
          scope,
          record: log,
        });
      }
    }
  }
  return out;
}
