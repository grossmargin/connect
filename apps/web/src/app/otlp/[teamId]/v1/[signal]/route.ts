import { gunzipSync } from "zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { extractKey, flattenSignal, verifyIntakeKey } from "@/lib/server/otlp";

export const dynamic = "force-dynamic";

// OTLP/HTTP JSON intake for Claude Code / Cowork telemetry.
// The native OTel exporter posts to `${APP_URL}/otlp/<teamId>/v1/{traces|metrics|logs}`.
// Spans and log records are stored (one row per leaf); metrics are acknowledged
// but discarded. Any valid intake key authenticates for any team.

const SIGNALS = new Set(["traces", "metrics", "logs"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ teamId: string; signal: string }> }) {
  const { teamId, signal } = await ctx.params;

  if (!SIGNALS.has(signal)) return notFound();

  const key = extractKey(req);
  if (!key || !verifyIntakeKey(key)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // teamId comes from the path (caller-controlled): require a real Team.
  if (!UUID_RE.test(teamId)) return notFound();
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return notFound();

  let payload: unknown;
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    const enc = req.headers.get("content-encoding") ?? "";
    const raw = enc.includes("gzip") ? gunzipSync(buf) : buf;
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return Response.json({ error: "body must be valid OTLP/JSON" }, { status: 400 });
  }

  // metrics -> ignored; traces/logs -> one row per leaf record.
  const rows: Prisma.OtlpRecordCreateManyInput[] = flattenSignal(signal, payload).map((r) => ({
    teamId,
    signalType: r.signalType,
    timeUnixNano: r.timeUnixNano,
    name: r.name,
    traceId: r.traceId,
    spanId: r.spanId,
    severity: r.severity,
    resource: r.resource as Prisma.InputJsonValue,
    scope: r.scope == null ? Prisma.DbNull : (r.scope as Prisma.InputJsonValue),
    record: r.record as Prisma.InputJsonValue,
  }));
  if (rows.length > 0) {
    await prisma.otlpRecord.createMany({ data: rows });
  }

  // OTLP success is an empty Export*ServiceResponse.
  return Response.json({}, { status: 200 });
}

function notFound() {
  return new Response("not found", { status: 404 });
}
