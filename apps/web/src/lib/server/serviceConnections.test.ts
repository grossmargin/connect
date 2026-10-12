import { expect, test, beforeAll, mock } from "bun:test";
import { randomBytes } from "crypto";

// Stub the Next.js build guard and the DB.
mock.module("server-only", () => ({}));
mock.module("@/lib/server/db", () => ({ prisma: {} }));
const { packServiceConfig, readServiceConfig, publicServiceConfig } = await import("./serviceConnections");
const types = await import("@/lib/isomorphic/serviceConnectionTypes");

beforeAll(() => {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

function row(type: string, packed: ReturnType<typeof packServiceConfig>) {
  if ("error" in packed) throw new Error(packed.error);
  return { type, config: packed.config, secrets: packed.secrets };
}

test("token fields go to encrypted secrets and are joined on read", () => {
  const conn = row(
    "google-services",
    packServiceConfig("google-services", {
      scopes: { drive: "readonly" },
      granted: { drive: "readonly" },
      email: "a@b.c",
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: 123,
    }),
  );
  expect(publicServiceConfig(conn)).toEqual({ scopes: { drive: "readonly" }, granted: { drive: "readonly" }, email: "a@b.c" });
  expect(Buffer.from(conn.secrets).toString("utf8")).not.toContain("rt-1");
  expect(readServiceConfig(conn)).toMatchObject({ accessToken: "at-1", refreshToken: "rt-1", expiresAt: 123 });
});

test("rejects bad values and unknown types", () => {
  expect(packServiceConfig("google-services", { scopes: { drive: "admin" } })).toHaveProperty("error");
  expect(packServiceConfig("nango", {})).toHaveProperty("error");
});

test("scopes follow the selection", () => {
  expect(types.scopesFor("google-services", { drive: "readonly" })).toEqual([
    "openid",
    "email",
    "https://www.googleapis.com/auth/drive.readonly",
  ]);
  expect(types.scopesFor("google-services", { drive: "readwrite" })).toContain("https://www.googleapis.com/auth/drive");
  expect(types.scopesFor("quickbooks", { accounting: true, payments: false })).toEqual(["com.intuit.quickbooks.accounting"]);
  expect(types.scopesFor("google-services", { drive: "none", gmail: "readwrite" })).toEqual([
    "openid",
    "email",
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/gmail.settings.basic",
    "https://www.googleapis.com/auth/gmail.settings.sharing",
  ]);
  expect(types.selectionIsEmpty("google-services", { drive: "none" })).toBe(true);
  expect(types.selectionIsEmpty("quickbooks", {})).toBe(true);
});

test("connection state: not connected, connected, needs reconnect", () => {
  expect(types.connectionState("google-services", { scopes: { drive: "readonly" } })).toBe("NOT_CONNECTED");
  expect(types.connectionState("google-services", { scopes: { drive: "readonly" }, granted: { drive: "readonly" } })).toBe(
    "CONNECTED",
  );
  expect(
    types.connectionState("google-services", { scopes: { drive: "readwrite" }, granted: { drive: "readonly" } }),
  ).toBe("NEEDS_RECONNECT");
  expect(types.connectionState("quickbooks", { products: { accounting: true }, granted: { accounting: true, payments: false } })).toBe(
    "CONNECTED",
  );
});

test("selection label", () => {
  expect(types.selectionLabel("google-services", { drive: "readonly" })).toBe("Drive (read-only)");
  expect(types.selectionLabel("google-services", { drive: "readonly", gmail: "readwrite" })).toBe(
    "Drive (read-only), Gmail (read-write)",
  );
  expect(types.selectionLabel("quickbooks", { accounting: true, payments: true })).toBe("Accounting, Payments");
});

test("granted levels come from the exact scopes", () => {
  const drive = "https://www.googleapis.com/auth/drive";
  // gmail.modify alone (old read-write) no longer counts as read-write.
  expect(types.googleGrantedFromScopes([drive, "https://www.googleapis.com/auth/gmail.modify"])).toEqual({
    drive: "readwrite",
    gmail: "none",
  });
  expect(
    types.googleGrantedFromScopes(types.scopesFor("google-services", { drive: "readonly", gmail: "readwrite" })),
  ).toEqual({ drive: "readonly", gmail: "readwrite" });
  // Missing one settings scope: not read-write.
  expect(types.googleGrantedFromScopes(["https://mail.google.com/", "https://www.googleapis.com/auth/gmail.settings.basic"]).gmail).toBe("none");
});
