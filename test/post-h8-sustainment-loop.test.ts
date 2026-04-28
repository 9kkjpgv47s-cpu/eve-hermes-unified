import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("run-post-h8-sustainment-loop.mjs", () => {
  it("exposes verify:sustainment-loop npm script", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop"]).toContain("run-post-h8-sustainment-loop.mjs");
  });

  it("emits pass and structured checks in sustainment loop manifest", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/run-post-h8-sustainment-loop.mjs")],
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
        h8AssuranceBundlePass?: boolean;
        h8CloseoutGatePass?: boolean;
      };
    };
    expect(payload.pass).toBe(true);
    expect(payload.checks?.horizonStatusPass).toBe(true);
    expect(payload.checks?.h8AssuranceBundlePass).toBe(true);
    expect(payload.checks?.h8CloseoutGatePass).toBe(true);
  });

  it("validate:post-h8-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h8-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});
