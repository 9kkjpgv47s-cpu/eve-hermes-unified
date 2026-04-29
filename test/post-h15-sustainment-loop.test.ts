import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("run-post-h15-sustainment-loop.mjs (legacy)", () => {
  it("exposes verify:sustainment-loop:h15-legacy npm script", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h15-legacy"]).toContain("run-post-h15-sustainment-loop.mjs");
  });

  it(
    "emits pass and structured checks in legacy sustainment loop manifest",
    async () => {
      const result = await runCommandWithTimeout(
        ["node", path.join(repoRoot, "scripts/run-post-h15-sustainment-loop.mjs")],
        { timeoutMs: 360_000 },
      );
      expect(result.code).toBe(0);
      const out = result.stdout.trim();
      const last = out.split("\n").filter(Boolean).pop() ?? "";
      const raw = await readFile(last, "utf8");
      const payload = JSON.parse(raw) as {
        pass?: boolean;
        checks?: {
          horizonStatusPass?: boolean;
          h15AssuranceBundlePass?: boolean;
          h15CloseoutGatePass?: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks?.horizonStatusPass).toBe(true);
      expect(payload.checks?.h15AssuranceBundlePass).toBe(true);
      expect(payload.checks?.h15CloseoutGatePass).toBe(true);
    },
    360_000,
  );

  it("validate:post-h15-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h15-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});
