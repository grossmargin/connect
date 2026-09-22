import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/db";
import {
  enumerateBuckets,
  type Granularity,
  type StatsRange,
} from "@/lib/isomorphic/statsRange";

// Team Stats aggregations. All bucketing happens in SQL via date_trunc over the
// UTC-stored timestamps, returned as epoch-ms so the client can format without
// re-parsing. OTLP session/user/cost fields live inside the raw record JSON, so
// those are pulled out with scalar subqueries over record->'attributes'.
//
// An optional `userEmail` narrows the whole dashboard to one person: MCP calls
// by their User id, telemetry (sessions/spend) by their user.email attribute.

export type BucketPoint = {
  ms: number;
  calls: number;
  errors: number;
  sessions: number;
  costUsd: number;
};

export type ToolRow = { tool: string; calls: number; errors: number };

export type UserRow = {
  key: string;
  label: string;
  kind: "USER" | "SERVICE_ACCOUNT";
  calls: number;
  errors: number;
  sessions: number;
  costUsd: number;
  // Per-bucket counts aligned to the chart's bucket list (for sparklines).
  sparkCalls: number[];
  sparkSessions: number[];
};

export type TeamStats = {
  range: StatsRange;
  // Every user (email) with activity in this window, for the top-of-page filter.
  userOptions: string[];
  selectedUser: string | null;
  summary: {
    calls: number;
    errors: number;
    sessions: number;
    activeUsers: number;
    costUsd: number;
  };
  series: BucketPoint[];
  topTools: ToolRow[];
  users: UserRow[];
};

// date_trunc(...) as epoch-ms. `colExpr` (a column reference, possibly table-
// qualified) and `g` come only from typed literals here, so interpolating them
// into raw SQL is safe.
function bucketMs(colExpr: string, g: Granularity) {
  return Prisma.raw(`(extract(epoch from date_trunc('${g}', ${colExpr})) * 1000)::float8`);
}

// A record's session id / user email / call cost, extracted from the OTLP leaf.
const SID = Prisma.raw(
  `(SELECT a->'value'->>'stringValue' FROM jsonb_array_elements(record->'attributes') a WHERE a->>'key'='session.id')`,
);
const EMAIL = Prisma.raw(
  `(SELECT a->'value'->>'stringValue' FROM jsonb_array_elements(record->'attributes') a WHERE a->>'key'='user.email')`,
);
const COST = Prisma.raw(
  `(SELECT (a->'value'->>'doubleValue')::float8 FROM jsonb_array_elements(record->'attributes') a WHERE a->>'key'='cost_usd')`,
);

export async function getTeamStats(
  teamId: string,
  range: StatsRange,
  userEmail: string | null = null,
): Promise<TeamStats> {
  const from = new Date(range.fromISO);
  const to = new Date(range.toISO);
  const g = range.granularity;
  const bCall = bucketMs(`"createdAt"`, g);
  const bRecv = bucketMs(`"receivedAt"`, g);
  // The per-actor query joins User/ServiceAccount, which also have createdAt, so
  // its bucket column must be table-qualified.
  const bCallActor = bucketMs(`l."createdAt"`, g);

  // Resolve the selected email to a User id for the MCP-call side of the filter.
  const selectedUserId = userEmail
    ? (await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } }))?.id ?? null
    : null;

  // Filter fragments. MCP-call queries come in aliased (`l.`) and unaliased
  // forms; OTLP filters compare the extracted email attribute. When a user is
  // selected who has no User row, the call filter matches nothing.
  const callFilter = userEmail
    ? selectedUserId
      ? Prisma.sql`AND "actorType" = 'USER' AND "actorId" = ${selectedUserId}::uuid`
      : Prisma.sql`AND false`
    : Prisma.empty;
  const callFilterL = userEmail
    ? selectedUserId
      ? Prisma.sql`AND l."actorType" = 'USER' AND l."actorId" = ${selectedUserId}::uuid`
      : Prisma.sql`AND false`
    : Prisma.empty;
  const otlpFilter = userEmail ? Prisma.sql`AND ${EMAIL} = ${userEmail}` : Prisma.empty;

  const [
    userOpts,
    callBuckets,
    otlpBuckets,
    tools,
    callActors,
    sessionUsers,
    actorCallBuckets,
    userSessionBuckets,
    callTotals,
    otlpTotals,
  ] = await Promise.all([
    // Selector options: every user (email) with activity in this window,
    // regardless of the current user filter.
    prisma.$queryRaw<{ email: string }[]>`
      SELECT DISTINCT email FROM (
        SELECT u.email AS email
        FROM "McpCallLog" l
        JOIN "User" u ON l."actorType" = 'USER' AND u.id = l."actorId"
        WHERE l."teamId" = ${teamId}::uuid AND l."createdAt" >= ${from} AND l."createdAt" < ${to}
        UNION
        SELECT ${EMAIL} AS email
        FROM "OtlpRecord"
        WHERE "teamId" = ${teamId}::uuid AND "receivedAt" >= ${from} AND "receivedAt" < ${to}
      ) x
      WHERE email IS NOT NULL ORDER BY email`,

    // Tool calls + errors per bucket.
    prisma.$queryRaw<{ bucket: number; calls: number; errors: number }[]>`
      SELECT ${bCall} AS bucket,
             count(*)::int AS calls,
             count(*) FILTER (WHERE NOT ok)::int AS errors
      FROM "McpCallLog"
      WHERE "teamId" = ${teamId}::uuid AND "createdAt" >= ${from} AND "createdAt" < ${to} ${callFilter}
      GROUP BY 1 ORDER BY 1`,

    // Sessions + spend per bucket (OTLP telemetry).
    prisma.$queryRaw<{ bucket: number; sessions: number; cost: number }[]>`
      WITH o AS (
        SELECT "receivedAt", ${SID} AS sid, ${COST} AS cost
        FROM "OtlpRecord"
        WHERE "teamId" = ${teamId}::uuid AND "receivedAt" >= ${from} AND "receivedAt" < ${to} ${otlpFilter}
      )
      SELECT ${bRecv} AS bucket,
             count(DISTINCT sid)::int AS sessions,
             COALESCE(sum(cost), 0)::float8 AS cost
      FROM o GROUP BY 1 ORDER BY 1`,

    // Top tools by call volume.
    prisma.$queryRaw<{ tool: string; calls: number; errors: number }[]>`
      SELECT "toolName" AS tool,
             count(*)::int AS calls,
             count(*) FILTER (WHERE NOT ok)::int AS errors
      FROM "McpCallLog"
      WHERE "teamId" = ${teamId}::uuid AND "createdAt" >= ${from} AND "createdAt" < ${to} ${callFilter}
      GROUP BY 1 ORDER BY calls DESC LIMIT 10`,

    // Calls per actor (users and service accounts).
    prisma.$queryRaw<{ label: string; kind: string; calls: number; errors: number }[]>`
      SELECT COALESCE(u.email, sa.name, l."actorId"::text) AS label,
             l."actorType" AS kind,
             count(*)::int AS calls,
             count(*) FILTER (WHERE NOT l.ok)::int AS errors
      FROM "McpCallLog" l
      LEFT JOIN "User" u ON l."actorType" = 'USER' AND u.id = l."actorId"
      LEFT JOIN "ServiceAccount" sa ON l."actorType" = 'SERVICE_ACCOUNT' AND sa.id = l."actorId"
      WHERE l."teamId" = ${teamId}::uuid AND l."createdAt" >= ${from} AND l."createdAt" < ${to} ${callFilterL}
      GROUP BY 1, 2`,

    // Sessions + spend per user (OTLP, keyed by email).
    prisma.$queryRaw<{ email: string; sessions: number; cost: number }[]>`
      WITH o AS (
        SELECT ${SID} AS sid, ${EMAIL} AS email, ${COST} AS cost
        FROM "OtlpRecord"
        WHERE "teamId" = ${teamId}::uuid AND "receivedAt" >= ${from} AND "receivedAt" < ${to} ${otlpFilter}
      )
      SELECT email, count(DISTINCT sid)::int AS sessions, COALESCE(sum(cost), 0)::float8 AS cost
      FROM o WHERE email IS NOT NULL GROUP BY 1`,

    // Calls per actor per bucket (per-user calls sparkline).
    prisma.$queryRaw<{ label: string; bucket: number; calls: number }[]>`
      SELECT COALESCE(u.email, sa.name, l."actorId"::text) AS label,
             ${bCallActor} AS bucket,
             count(*)::int AS calls
      FROM "McpCallLog" l
      LEFT JOIN "User" u ON l."actorType" = 'USER' AND u.id = l."actorId"
      LEFT JOIN "ServiceAccount" sa ON l."actorType" = 'SERVICE_ACCOUNT' AND sa.id = l."actorId"
      WHERE l."teamId" = ${teamId}::uuid AND l."createdAt" >= ${from} AND l."createdAt" < ${to} ${callFilterL}
      GROUP BY 1, 2`,

    // Sessions per user per bucket (per-user sessions sparkline).
    prisma.$queryRaw<{ email: string; bucket: number; sessions: number }[]>`
      WITH o AS (
        SELECT "receivedAt", ${SID} AS sid, ${EMAIL} AS email
        FROM "OtlpRecord"
        WHERE "teamId" = ${teamId}::uuid AND "receivedAt" >= ${from} AND "receivedAt" < ${to} ${otlpFilter}
      )
      SELECT email, ${bRecv} AS bucket, count(DISTINCT sid)::int AS sessions
      FROM o WHERE email IS NOT NULL GROUP BY 1, 2`,

    prisma.$queryRaw<{ calls: number; errors: number }[]>`
      SELECT count(*)::int AS calls, count(*) FILTER (WHERE NOT ok)::int AS errors
      FROM "McpCallLog"
      WHERE "teamId" = ${teamId}::uuid AND "createdAt" >= ${from} AND "createdAt" < ${to} ${callFilter}`,

    prisma.$queryRaw<{ sessions: number; users: number; cost: number }[]>`
      WITH o AS (
        SELECT ${SID} AS sid, ${EMAIL} AS email, ${COST} AS cost
        FROM "OtlpRecord"
        WHERE "teamId" = ${teamId}::uuid AND "receivedAt" >= ${from} AND "receivedAt" < ${to} ${otlpFilter}
      )
      SELECT count(DISTINCT sid)::int AS sessions,
             count(DISTINCT email)::int AS users,
             COALESCE(sum(cost), 0)::float8 AS cost
      FROM o`,
  ]);

  // Assemble the continuous bucket series, filling gaps with zeros.
  const buckets = enumerateBuckets(range.fromISO, range.toISO, g);
  const idx = new Map(buckets.map((ms, i) => [ms, i]));
  const series: BucketPoint[] = buckets.map((ms) => ({ ms, calls: 0, errors: 0, sessions: 0, costUsd: 0 }));
  for (const r of callBuckets) {
    const i = idx.get(r.bucket);
    if (i != null) {
      series[i].calls = r.calls;
      series[i].errors = r.errors;
    }
  }
  for (const r of otlpBuckets) {
    const i = idx.get(r.bucket);
    if (i != null) {
      series[i].sessions = r.sessions;
      series[i].costUsd = r.cost;
    }
  }

  // Per-user sparkline arrays, aligned to the bucket list.
  const zeros = () => new Array(buckets.length).fill(0) as number[];
  const callsSpark = new Map<string, number[]>();
  for (const r of actorCallBuckets) {
    let arr = callsSpark.get(r.label);
    if (!arr) callsSpark.set(r.label, (arr = zeros()));
    const i = idx.get(r.bucket);
    if (i != null) arr[i] = r.calls;
  }
  const sessSpark = new Map<string, number[]>();
  for (const r of userSessionBuckets) {
    let arr = sessSpark.get(r.email);
    if (!arr) sessSpark.set(r.email, (arr = zeros()));
    const i = idx.get(r.bucket);
    if (i != null) arr[i] = r.sessions;
  }

  // Merge per-actor calls and per-user telemetry into one union, keyed by label.
  const sessByEmail = new Map(sessionUsers.map((r) => [r.email, r]));
  const users = new Map<string, UserRow>();
  for (const r of callActors) {
    const tele = sessByEmail.get(r.label);
    users.set(r.label, {
      key: r.label,
      label: r.label,
      kind: r.kind === "SERVICE_ACCOUNT" ? "SERVICE_ACCOUNT" : "USER",
      calls: r.calls,
      errors: r.errors,
      sessions: tele?.sessions ?? 0,
      costUsd: tele?.cost ?? 0,
      sparkCalls: callsSpark.get(r.label) ?? zeros(),
      sparkSessions: sessSpark.get(r.label) ?? zeros(),
    });
  }
  // Users seen only in telemetry (sessions/spend but no MCP calls).
  for (const [email, tele] of sessByEmail) {
    if (!users.has(email)) {
      users.set(email, {
        key: email,
        label: email,
        kind: "USER",
        calls: 0,
        errors: 0,
        sessions: tele.sessions,
        costUsd: tele.cost,
        sparkCalls: zeros(),
        sparkSessions: sessSpark.get(email) ?? zeros(),
      });
    }
  }
  const userRows = [...users.values()].sort(
    (a, b) => b.calls - a.calls || b.sessions - a.sessions || a.label.localeCompare(b.label),
  );

  const callSum = callTotals[0] ?? { calls: 0, errors: 0 };
  const otlpSum = otlpTotals[0] ?? { sessions: 0, users: 0, cost: 0 };

  return {
    range,
    userOptions: userOpts.map((r) => r.email),
    selectedUser: userEmail,
    summary: {
      calls: callSum.calls,
      errors: callSum.errors,
      sessions: otlpSum.sessions,
      activeUsers: otlpSum.users,
      costUsd: otlpSum.cost,
    },
    series,
    topTools: tools,
    users: userRows,
  };
}
