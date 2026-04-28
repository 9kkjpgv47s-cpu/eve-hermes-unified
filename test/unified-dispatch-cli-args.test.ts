import { describe, expect, it } from "vitest";
import { parseUnifiedDispatchCliArgs } from "../src/bin/unified-dispatch.js";

describe("parseUnifiedDispatchCliArgs", () => {
  it("parses required text and optional ids", () => {
    const parsed = parseUnifiedDispatchCliArgs(["--text", "hello", "--chat-id", "9", "--message-id", "42"]);
    expect(parsed.text).toBe("hello");
    expect(parsed.chatId).toBe("9");
    expect(parsed.messageId).toBe("42");
    expect(parsed.compactJson).toBe(false);
  });

  it("sets compactJson when --compact-json is present", () => {
    const parsed = parseUnifiedDispatchCliArgs(["--text", "x", "--compact-json"]);
    expect(parsed.compactJson).toBe(true);
  });

  it("throws when --text is missing", () => {
    expect(() => parseUnifiedDispatchCliArgs(["--compact-json"])).toThrow(/Missing required --text/);
  });
});
