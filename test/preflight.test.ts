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

  it("fails when memory file directory is not writable", async () => {
    await withTempDir(async (dir) => {
      const blockedFile = path.join(dir, "blocked");
      await writeFile(blockedFile, "x", "utf8");
      const config = {
        ...baseConfig(dir),
        unifiedMemoryFilePath: path.join(blockedFile, "dispatch.json"),
      };
      await expect(runRuntimePreflight(config)).rejects.toThrow(
        "Unified memory file path is not writable",
      );
    });
  });

  it("fails when dual-write shadow path equals primary path", async () => {
    await withTempDir(async (dir) => {
      const mem = path.join(dir, "same.json");
      const config = {
        ...baseConfig(dir),
        unifiedMemoryFilePath: mem,
        unifiedMemoryDualWriteFilePath: mem,
      };
      await expect(runRuntimePreflight(config)).rejects.toThrow(
        "dual-write shadow path must differ",
      );
    });
  });

  it("fails when durable WAL path parent is not writable", async () => {
    await withTempDir(async (dir) => {
      const blocked = path.join(dir, "blocked");
      await writeFile(blocked, "x", "utf8");
      const walPath = path.join(blocked, "nested", "wal.jsonl");
      const config = {
        ...baseConfig(dir),
        dispatchDurableWalPath: walPath,
      };
      await expect(runRuntimePreflight(config)).rejects.toThrow(
        "Dispatch durable WAL path is not writable",
      );
    });
  });

  it("fails strict tenant isolation when dispatch tenant id is empty", async () => {
    await withTempDir(async (dir) => {
      const config = {
        ...baseConfig(dir),
        tenantIsolationStrict: true,
        dispatchTenantId: "",
      };
      await expect(runRuntimePreflight(config)).rejects.toThrow("Tenant isolation strict mode");
    });
  });

  it("passes strict tenant isolation when dispatch tenant id is set", async () => {
    await withTempDir(async (dir) => {
      const config = {
        ...baseConfig(dir),
        tenantIsolationStrict: true,
        dispatchTenantId: "tenant-a",
      };
      await expect(runRuntimePreflight(config)).resolves.toEqual([]);
    });
  });
});
