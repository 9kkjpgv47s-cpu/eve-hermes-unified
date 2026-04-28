import { describe, expect, it } from "vitest";
import { p95 } from "../src/soak/latency-stats.js";

describe("p95", () => {
  it("returns 95th order statistic", () => {
    const v = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(p95(v)).toBe(19);
  });
});
