import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("run-post-h10-sustainment-loop.mjs (legacy)", () => {
  it("npm script verify:sustainment-loop:h10-legacy invokes post-H10 loop", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h10-legacy"]).toContain("run-post-h10-sustainment-loop.mjs");
  });

  it("emits pass and structured checks in sustainment loop manifest", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/run-post-h10-sustainment-loop.mjs")],
      { timeoutMs: 120_000 },
    );
    expect(result.code).toBe(0);
    const out = result.stdout.trim();
    const last = out.split("\n").filter(Boolean).pop() ?? "";
    const raw = await readFile(last, "utf8");
    const payload = JSON.parse(raw) as {
      pass?: boolean;
      checks?: {
        horizonStatusPass?: boolean;
        h10AssuranceBundlePass?: boolean;
        h10CloseoutGatePass?: boolean;
      };
    };
    expect(payload.pass).toBe(true);
    expect(payload.checks?.horizonStatusPass).toBe(true);
    expect(payload.checks?.h10AssuranceBundlePass).toBe(true);
    expect(payload.checks?.h10CloseoutGatePass).toBe(true);
  });

  it("validate:post-h10-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h10-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});
