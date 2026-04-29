import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

describe("run-long-window-soak.sh", () => {
  it("writes soak jsonl and soak-slo-scheduled json for small iteration count", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "long-soak-"));
    try {
      const result = await runCommandWithTimeout(
        ["bash", "scripts/run-long-window-soak.sh", "2"],
        {
          timeoutMs: 120_000,
          env: {
            ...process.env,
            UNIFIED_EVIDENCE_DIR: dir,
            UNIFIED_MEMORY_STORE_KIND: "file",
            UNIFIED_MEMORY_FILE_PATH: path.join(dir, "mem.json"),
            EVE_TASK_DISPATCH_SCRIPT: "/bin/true",
            EVE_DISPATCH_RESULT_PATH: path.join(dir, "eve-dispatch.json"),
            HERMES_LAUNCH_COMMAND: "/bin/true",
            HERMES_LAUNCH_ARGS: "",
          },
        },
      );
      expect(result.code).toBe(0);
      const names = await readdir(dir);
      expect(names.some((n) => n.startsWith("soak-") && n.endsWith(".jsonl"))).toBe(true);
      const sloName = names.find((n) => n.startsWith("soak-slo-scheduled-") && n.endsWith(".json"));
      expect(sloName).toBeTruthy();
      const payload = JSON.parse(await readFile(path.join(dir, sloName!), "utf8")) as { pass: boolean };
      expect(typeof payload.pass).toBe("boolean");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
