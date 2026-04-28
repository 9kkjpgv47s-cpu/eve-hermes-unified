import { describe, expect, it } from "vitest";
import { parseUnifiedDispatchCliArgs } from "../src/bin/unified-dispatch.js";

describe("parseUnifiedDispatchCliArgs", () => {
  it("parses required text and defaults", () => {
    const parsed = parseUnifiedDispatchCliArgs(["--text", "hello"]);
    expect(parsed.text).toBe("hello");
    expect(parsed.chatId).toBe("0");
    expect(parsed.messageId).toBe("0");
    expect(parsed.compactJson).toBe(false);
  });

  it("parses chat and message ids", () => {
    const parsed = parseUnifiedDispatchCliArgs([
      "--text",
      "x",
      "--chat-id",
      "42",
      "--message-id",
      "99",
    ]);
    expect(parsed.chatId).toBe("42");
    expect(parsed.messageId).toBe("99");
  });

  it("parses --compact-json flag", () => {
    const parsed = parseUnifiedDispatchCliArgs(["--text", "hello", "--compact-json"]);
    expect(parsed.compactJson).toBe(true);
  });

  it("throws when --text is missing", () => {
    expect(() => parseUnifiedDispatchCliArgs([])).toThrow(/Missing required --text argument/);
  });
});
