import { describe, expect, it } from "vitest";
import { redactLaneIo } from "../src/config/lane-io-redact.js";

describe("redactLaneIo", () => {
  it("redacts bearer tokens when enabled", () => {
    const raw = "Authorization: Bearer abcdef1234567890 token";
    const out = redactLaneIo(raw, true, "");
    expect(out).not.toContain("abcdef");
    expect(out).toContain("[REDACTED]");
  });

  it("leaves text unchanged when disabled", () => {
    expect(redactLaneIo("Bearer secret", false, "")).toBe("Bearer secret");
  });
});
