import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("emergency-rollback-rehearsal.sh", () => {
  it("writes a rehearsal manifest JSON", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rollback-reh-"));
    try {
      const result = await runCommandWithTimeout(
        ["bash", "scripts/emergency-rollback-rehearsal.sh"],
        {
          timeoutMs: 15_000,
          env: { ...process.env, UNIFIED_EVIDENCE_DIR: dir } as Record<string, string>,
        },
      );
      expect(result.code).toBe(0);
      const files = (await import("node:fs/promises")).readdir(dir);
      const names = await files;
      const manifest = names.find((n) => n.startsWith("emergency-rollback-rehearsal-") && n.endsWith(".json"));
      expect(manifest).toBeTruthy();
      const payload = JSON.parse(await readFile(path.join(dir, manifest!), "utf8"));
      expect(payload.kind).toBe("emergency_rollback_rehearsal_manifest");
      expect(payload.rollbackScriptPresent).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
