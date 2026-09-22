import { gunzipSync } from "zlib";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import { extractKey, flattenSignal, verifyIntakeKey } from "@/lib/server/otlp";
import { getTeamByIdOrSlug } from "@/lib/server/team";

export const dynamic = "force-dynamic";

// OTLP/HTTP JSON intake for Claude Code / Cowork telemetry.
// The native OTel exporter posts to `${APP_URL}/<teamIdOrSlug>/otlp/v1/{traces|metrics|logs}`.
// Spans and log records are stored (one row per leaf); metrics are acknowledged
// but discarded. Any valid intake key authenticates for any team.

const SIGNALS = new Set(["traces", "metrics", "logs"]);

export async function POST(req: Request, ctx: { params: Promise<{ teamIdOrSlug: string; signal: string }> }) {
  const { teamIdOrSlug, signal } = await ctx.params;

  if (!SIGNALS.has(signal)) return notFound();

  const key = extractKey(req);
  if (!key || !verifyIntakeKey(key)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // The path segment (caller-controlled) is a team id or slug: require a real Team.
  const team = await getTeamByIdOrSlug(teamIdOrSlug);
  if (!team) return notFound();
  const teamId = team.id;

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
