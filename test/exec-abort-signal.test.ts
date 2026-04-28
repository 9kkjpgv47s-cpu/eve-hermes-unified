import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("runCommandWithTimeout", () => {
  it("terminates with signal when AbortSignal is aborted", async () => {
    const ac = new AbortController();
    const promise = runCommandWithTimeout(
      ["node", "-e", "setInterval(() => {}, 1_000_000)"],
      { timeoutMs: 120_000, signal: ac.signal },
    );
    setTimeout(() => ac.abort(), 80);
    const result = await promise;
    expect(result.termination).toBe("signal");
    expect(result.code).not.toBe(0);
  });

  it("returns immediately when signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const result = await runCommandWithTimeout(["node", "-e", "process.exit(0)"], {
      timeoutMs: 120_000,
      signal: ac.signal,
    });
    expect(result.termination).toBe("signal");
  });
});
