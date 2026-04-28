import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("run-post-h6-sustainment-loop.mjs", () => {
  it("exposes verify:sustainment-loop npm script", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop"]).toContain("run-post-h6-sustainment-loop.mjs");
  });

  it("exits 0 when horizon status, H6 bundle, and H6 closeout pass", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/run-post-h6-sustainment-loop.mjs")],
      { timeoutMs: 120_000 },
    );
    expect(result.code).toBe(0);
    const out = result.stdout.trim();
    const last = out.split("\n").filter(Boolean).pop() ?? "";
    expect(last).toMatch(/post-h6-sustainment-loop-.*\.json$/);
  });
});
