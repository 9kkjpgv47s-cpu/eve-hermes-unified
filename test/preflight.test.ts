import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runRuntimePreflight, type RuntimePreflightConfig } from "../src/runtime/preflight.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "unified-preflight-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function baseConfig(rootDir: string): RuntimePreflightConfig {
  return {
    enabled: true,
    strict: true,
    eveDispatchScript: "/bin/true",
    eveDispatchResultPath: path.join(rootDir, "eve-dispatch.json"),
    hermesLaunchCommand: "/bin/true",
    unifiedMemoryStoreKind: "file",
    unifiedMemoryFilePath: path.join(rootDir, "memory-store.json"),
    auditEnabled: true,
    auditLogPath: path.join(rootDir, "audit.jsonl"),
  };
}

describe("runRuntimePreflight", () => {
  it("passes for valid commands and writable paths", async () => {
    await withTempDir(async (dir) => {
      await expect(runRuntimePreflight(baseConfig(dir))).resolves.toEqual([]);
    });
  });

  it("fails when required executable is missing", async () => {
    await withTempDir(async (dir) => {
      const config = {
        ...baseConfig(dir),
        hermesLaunchCommand: "/bin/does-not-exist",
      };
      await expect(runRuntimePreflight(config)).rejects.toThrow(
        "Hermes launch command is unavailable",
      );
    });
  });

  it("skips checks when preflight is disabled", async () => {
    await withTempDir(async (dir) => {
      const config = {
        ...baseConfig(dir),
        enabled: false,
        eveDispatchScript: "/bin/not-real",
        hermesLaunchCommand: "/bin/not-real",
      };
      await expect(runRuntimePreflight(config)).resolves.toEqual([]);
    });
  });

  it("fails when memory journal parent is not writable", async () => {
    await withTempDir(async (dir) => {
      const blockedFile = path.join(dir, "blocked");
      await writeFile(blockedFile, "x", "utf8");
      const config = {
        ...baseConfig(dir),
        unifiedMemoryJournalPath: path.join(blockedFile, "journal.jsonl"),
      };
      await expect(runRuntimePreflight(config)).rejects.toThrow(
        "Unified memory journal path is not writable",
      );
    });
  });

  it("fails when capability policy audit path is not writable", async () => {
    await withTempDir(async (dir) => {
      const blockedFile = path.join(dir, "blocked");
      await writeFile(blockedFile, "x", "utf8");
      const config = {
        ...baseConfig(dir),
        capabilityPolicyAuditPath: path.join(blockedFile, "policy.jsonl"),
      };
      await expect(runRuntimePreflight(config)).rejects.toThrow(
        "Capability policy audit path is not writable",
      );
    });
  });
});
