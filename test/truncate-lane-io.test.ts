import { describe, expect, it } from "vitest";
import { truncateLaneIo } from "../src/contracts/validate.js";

describe("truncateLaneIo", () => {
  it("truncates long strings", () => {
    const s = "a".repeat(30_000);
    const out = truncateLaneIo(s, 10_000);
    expect(out.length).toBe(10_001);
    expect(out.endsWith("…")).toBe(true);
  });
});
