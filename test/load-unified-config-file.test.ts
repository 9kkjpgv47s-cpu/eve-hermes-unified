import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { loadUnifiedConfigFile } from "../src/config/load-unified-config-file.js";

describe("loadUnifiedConfigFile", () => {
  const snap: Record<string, string | undefined> = {};

  beforeEach(() => {
    snap.UNIFIED_ROUTER_DEFAULT_PRIMARY = process.env.UNIFIED_ROUTER_DEFAULT_PRIMARY;
    delete process.env.UNIFIED_ROUTER_DEFAULT_PRIMARY;
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(snap)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("sets env from unified.config.json when unset", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ucfg-"));
    try {
      await writeFile(
        path.join(dir, "unified.config.json"),
        JSON.stringify({ UNIFIED_ROUTER_DEFAULT_PRIMARY: "hermes" }),
        "utf8",
      );
      await loadUnifiedConfigFile(dir);
      expect(process.env.UNIFIED_ROUTER_DEFAULT_PRIMARY).toBe("hermes");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
