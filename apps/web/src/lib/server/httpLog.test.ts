import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { redact, redactUrl } = await import("./httpLog");

test("masks secret fields at any depth, keeps the rest", () => {
  const out = redact({ client_id: "abc", headers: { Authorization: "Bearer 0123456789abcdef" }, tokens: [{ refresh_token: "r" }] });
  expect(out).toEqual({ client_id: "abc", headers: { Authorization: "Bearer…cdef (23)" }, tokens: [{ refresh_token: "r…(1)" }] });
  expect(redactUrl("https://x.io/cb?code=c1&access_token=0123456789abcdef")).toBe("https://x.io/cb?code=c1&access_token=012345%E2%80%A6cdef+%2816%29");
});
