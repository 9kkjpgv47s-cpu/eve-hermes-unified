import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h5-remediation-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("H5 scripts", () => {
  it("validate-h5-tenant-isolation exits 0", async () => {
    const result = await runCommandWithTimeout(
      ["node", "./scripts/validate-h5-tenant-isolation.mjs"],
      { timeoutMs: 5_000 },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("ok:");
  });

  it("remediation-playbook-dry-run writes valid manifest JSON", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      await mkdir(evidenceDir, { recursive: true });
      const result = await runCommandWithTimeout(
        ["bash", "./scripts/remediation-playbook-dry-run.sh", evidenceDir],
        { timeoutMs: 5_000 },
      );
      expect(result.code).toBe(0);
      const names = await readdir(evidenceDir);
      const manifestName = names.find((n) => n.startsWith("remediation-playbook-dry-run-") && n.endsWith(".json"));
      expect(manifestName).toBeTruthy();
      const raw = await readFile(path.join(evidenceDir, manifestName!), "utf8");
      const parsed = JSON.parse(raw) as { dryRun: boolean; boundedPolicy: { allowLiveMutation: boolean } };
      expect(parsed.dryRun).toBe(true);
      expect(parsed.boundedPolicy.allowLiveMutation).toBe(false);
    });
  });
});
