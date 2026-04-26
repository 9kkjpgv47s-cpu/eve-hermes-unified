import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("runCommandWithTimeout", () => {
  it("resolves timeout results for processes that ignore SIGTERM", { timeout: 10_000 }, async () => {
    const started = Date.now();
    const result = await runCommandWithTimeout(
      [
        "node",
        "-e",
        "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
      ],
      { timeoutMs: 50, killAfterTimeoutMs: 50 },
    );

    expect(result.termination).toBe("timeout");
    expect(result.signal).toBe("SIGKILL");
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
