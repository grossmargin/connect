import { expect, mock, test } from "bun:test";
mock.module("server-only", () => ({}));
const { parseBody, redact, redactUrl } = await import("./httpLog");

test("masks secret fields at any depth, keeps the rest", () => {
  const out = redact({ authorization_endpoint: "https://a", token_type: "Bearer", client_id: "abc", headers: { Authorization: "Bearer 0123456789abcdef" }, tokens: [{ refresh_token: "r" }] });
  expect(out).toEqual({ authorization_endpoint: "https://a", token_type: "Bearer", client_id: "abc", headers: { Authorization: "Bearer…cdef (23)" }, tokens: [{ refresh_token: "r…(1)" }] });
  expect(redactUrl("https://x.io/cb?code=c1&access_token=0123456789abcdef")).toBe("https://x.io/cb?code=c1&access_token=012345%E2%80%A6cdef+%2816%29");
});

test("masks secrets in a form-encoded body", () => {
  const body = parseBody(
    "grant_type=refresh_token&refresh_token=1%2F%2F05If0u7IOaLXACgYIARAAGAU&client_id=abc&client_secret=GOCSPX-abcdefghijkl",
    "application/x-www-form-urlencoded",
  ) as Record<string, string>;
  expect(body.grant_type).toBe("refresh_token");
  expect(body.client_id).toBe("abc");
  expect(body.refresh_token).not.toContain("05If0u7IOaLXACgYIARAAGAU");
  expect(body.client_secret).not.toContain("GOCSPX-abcdefghijkl");
});
