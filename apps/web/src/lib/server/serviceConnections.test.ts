import { expect, test, beforeAll, mock } from "bun:test";
import { randomBytes } from "crypto";

// Stub the Next.js build guard and the modules that reach the DB or network.
mock.module("server-only", () => ({}));
mock.module("@/lib/server/db", () => ({ prisma: {} }));
mock.module("@/lib/server/serviceNango", () => ({ listNangoConnections: () => [], getNangoCredentials: () => ({}) }));
mock.module("@/lib/server/audit", () => ({ audit: () => {} }));
mock.module("@/lib/server/mcp", () => ({ principalActor: () => ({}) }));
const { packServiceConfig, readServiceConfig, publicServiceConfig } = await import("./serviceConnections");
const { parseNangoConnectionKey, nangoConnectionKey } = await import("./serviceTools");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

function row(type: string, packed: ReturnType<typeof packServiceConfig>) {
  if ("error" in packed) throw new Error(packed.error);
  return { type, config: packed.config, secrets: packed.secrets };
}

test("splits secret fields into encrypted secrets and joins them on read", () => {
  const conn = row("nango", packServiceConfig("nango", { host: "https://nango.example.com/", secretKey: "sk-1" }));
  expect(conn.config).toEqual({ host: "https://nango.example.com" });
  expect(Buffer.from(conn.secrets).toString("utf8")).not.toContain("sk-1");
  expect(publicServiceConfig(conn)).toEqual({ host: "https://nango.example.com" });
  expect(readServiceConfig(conn)).toEqual({ host: "https://nango.example.com", secretKey: "sk-1" });
});

test("defaults the Nango host", () => {
  const conn = row("nango", packServiceConfig("nango", { host: "", secretKey: "sk-1" }));
  expect(conn.config).toEqual({ host: "https://api.nango.dev" });
});

test("an empty secret on edit keeps the stored value", () => {
  const prev = row("nango", packServiceConfig("nango", { secretKey: "sk-1" }));
  const next = row("nango", packServiceConfig("nango", { host: "https://h.example.com", secretKey: "" }, prev));
  expect(readServiceConfig(next)).toEqual({ host: "https://h.example.com", secretKey: "sk-1" });
});

test("rejects a missing secret and an unknown type", () => {
  expect(packServiceConfig("nango", { host: "https://h.example.com" })).toHaveProperty("error");
  expect(packServiceConfig("nope", {})).toHaveProperty("error");
});

test("connection_id round-trips, splitting on the first two colons", () => {
  const key = nangoConnectionKey("prod", "quickbooks", "user:42");
  expect(key).toBe("prod:quickbooks:user:42");
  expect(parseNangoConnectionKey(key)).toEqual({ slug: "prod", providerConfigKey: "quickbooks", connectionId: "user:42" });
  for (const bad of ["", "prod", "prod:qb", "prod:qb:", ":qb:1", "prod::1", 42]) {
    expect(parseNangoConnectionKey(bad)).toBeNull();
  }
});
