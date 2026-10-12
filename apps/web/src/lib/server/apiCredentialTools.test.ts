import { expect, test, mock } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/lib/server/db", () => ({ prisma: {} }));
const { filterEntries } = await import("./apiCredentialTools");

const entries = [
  { id: "3f1c0f9e-0000-4000-8000-000000000000", description: "Stripe · live secret key · TEXT" },
  { id: "google-v", description: "Google · v · Drive (read-only) · v@klimontovich.com" },
];

test("no pattern returns everything", () => {
  expect(filterEntries(entries)).toEqual(entries);
});

test("pattern matches id or description, case-insensitive", () => {
  expect(filterEntries(entries, "stripe")).toEqual([entries[0]]);
  expect(filterEntries(entries, "^google-")).toEqual([entries[1]]);
  expect(filterEntries(entries, "drive|stripe")).toEqual(entries);
});

test("invalid pattern is an error", () => {
  expect(filterEntries(entries, "(")).toHaveProperty("error");
});
