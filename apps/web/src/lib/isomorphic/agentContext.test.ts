import { expect, test } from "bun:test";
import { normalizeTelegramContext, parseWatchText } from "./agentContext";

test("watch list: split on lines, commas and spaces; trim and dedupe", () => {
  expect(parseWatchText("@ann\n@finance_chat, -100123  @ann\n\n")).toEqual(["@ann", "@finance_chat", "-100123", "@ann"]);
  expect(normalizeTelegramContext({ watch: [" @ann", "@ann", ""] })).toEqual({ watch: ["@ann"] });
  expect(normalizeTelegramContext(undefined)).toEqual({ watch: [] });
  expect(() => normalizeTelegramContext({ watch: "x" })).toThrow();
});
