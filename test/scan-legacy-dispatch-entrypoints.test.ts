import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("scan-legacy-dispatch-entrypoints.sh", () => {
  it("passes on the repository tree", async () => {
    const result = await runCommandWithTimeout(
      ["bash", "./scripts/scan-legacy-dispatch-entrypoints.sh"],
      { timeoutMs: 30_000 },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ok:");
  });
});
