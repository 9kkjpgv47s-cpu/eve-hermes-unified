import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scanScriptSource = path.join(repoRoot, "scripts", "scan-legacy-dispatch-entrypoints.sh");

describe("scan-legacy-dispatch-entrypoints.sh", () => {
  it("passes on the real repository tree", async () => {
    const result = await runCommandWithTimeout(["bash", scanScriptSource], {
      timeoutMs: 30_000,
      env: { ...process.env } as Record<string, string>,
    });
    expect(result.code).toBe(0);
    expect(result.stderr).not.toContain("error:");
  });

  it("fails when a non-allowlisted script invokes unified-dispatch.js directly", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "legacy-scan-test-"));
    try {
      const fakeRepo = path.join(tmp, "repo");
      const scriptsDir = path.join(fakeRepo, "scripts");
      await mkdir(path.join(fakeRepo, "docs"), { recursive: true });
      await mkdir(path.join(fakeRepo, "src"), { recursive: true });
      await mkdir(scriptsDir, { recursive: true });
      const scanCopy = path.join(scriptsDir, "scan-legacy-dispatch-entrypoints.sh");
      await copyFile(scanScriptSource, scanCopy);
      await writeFile(
        path.join(scriptsDir, "naughty.sh"),
        "#!/usr/bin/env bash\nnode \"$ROOT/dist/src/bin/unified-dispatch.js\"\n",
        "utf8",
      );
      const result = await runCommandWithTimeout(["bash", scanCopy], {
        timeoutMs: 15_000,
        env: { ...process.env } as Record<string, string>,
      });
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("forbidden direct unified-dispatch invocation");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
