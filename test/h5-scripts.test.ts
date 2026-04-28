import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempEvidenceDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h5-scripts-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("H5 operator scripts", () => {
  it("h5-region-misalignment-drill passes and writes manifest", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const result = await runCommandWithTimeout(
        ["node", "scripts/h5-region-misalignment-drill.mjs", "--evidence-dir", evidenceDir],
        { timeoutMs: 60_000, env: { ...process.env } as Record<string, string> },
      );
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout.trim()) as {
        pass?: boolean;
        manifestPath?: string;
        schemaVersion?: string;
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.manifestPath).toContain("h5-region-misalignment-drill-");
      expect(parsed.schemaVersion).toBe("h5-region-misalignment-drill-v2");
    });
  });

  it("validate-h5-tenant-isolation emits valid JSON", async () => {
    const result = await runCommandWithTimeout(["node", "scripts/validate-h5-tenant-isolation.mjs"], {
      timeoutMs: 10_000,
    });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as { valid?: boolean };
    expect(parsed.valid).toBe(true);
  });

  it("remediation-playbook-dry-run writes a JSON manifest under EVIDENCE_DIR", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const result = await runCommandWithTimeout(["bash", "scripts/remediation-playbook-dry-run.sh"], {
        timeoutMs: 15_000,
        env: { ...process.env, EVIDENCE_DIR: evidenceDir } as Record<string, string>,
      });
      expect(result.code).toBe(0);
      const files = await readdir(evidenceDir);
      const manifest = files.find((f) => f.startsWith("remediation-playbook-dry-run-") && f.endsWith(".json"));
      expect(manifest).toBeDefined();
      const raw = await readFile(path.join(evidenceDir, manifest!), "utf8");
      const parsed = JSON.parse(raw) as { schemaVersion?: string; policyBounds?: { dryRunOnly?: boolean } };
      expect(parsed.schemaVersion).toContain("h5-remediation");
      expect(parsed.policyBounds?.dryRunOnly).toBe(true);
    });
  });
});
