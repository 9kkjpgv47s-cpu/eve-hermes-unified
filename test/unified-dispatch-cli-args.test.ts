import { describe, expect, it } from "vitest";
import { parseUnifiedDispatchCliArgs } from "../src/bin/unified-dispatch.js";

describe("parseUnifiedDispatchCliArgs", () => {
  it("parses required text and defaults", () => {
    const parsed = parseUnifiedDispatchCliArgs(["--text", "hello"]);
    expect(parsed.text).toBe("hello");
    expect(parsed.chatId).toBe("0");
    expect(parsed.messageId).toBe("0");
    expect(parsed.compactJson).toBe(false);
    expect(parsed.enqueueFailedPrimary).toBe(false);
    expect(parsed.replayQueue).toBe(false);
    expect(parsed.tenantId).toBe("");
    expect(parsed.regionId).toBe("");
  });

  it("parses tenant-id and region-id", () => {
    const parsed = parseUnifiedDispatchCliArgs([
      "--text",
      "x",
      "--tenant-id",
      "org-a",
      "--region-id",
      "eu-west-backup",
    ]);
    expect(parsed.tenantId).toBe("org-a");
    expect(parsed.regionId).toBe("eu-west-backup");
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

  it("allows --replay-queue without --text", () => {
    const parsed = parseUnifiedDispatchCliArgs(["--replay-queue"]);
    expect(parsed.replayQueue).toBe(true);
  });

  it("parses durability flags", () => {
    expect(
      parseUnifiedDispatchCliArgs(["--replay-queue", "--text", "x", "--enqueue-failed-primary"])
        .enqueueFailedPrimary,
    ).toBe(true);
  });

  it("throws when --text is missing and not replay", () => {
    expect(() => parseUnifiedDispatchCliArgs([])).toThrow(/Missing required --text argument/);
  });
});
