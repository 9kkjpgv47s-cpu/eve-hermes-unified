import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("verify-memory-durability.ts", () => {
  it("passes default temp-dir cycles", async () => {
    const result = await runCommandWithTimeout(
      ["npx", "tsx", "src/bin/verify-memory-durability.ts"],
      {
        timeoutMs: 60_000,
      },
    );
    expect(result.code).toBe(0);
    const payload = JSON.parse(result.stdout) as { pass?: boolean; cycles?: number };
    expect(payload.pass).toBe(true);
    expect(payload.cycles).toBe(3);
  });
});
