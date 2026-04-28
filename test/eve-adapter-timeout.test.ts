import { describe, expect, it } from "vitest";
import { EveAdapter } from "../src/adapters/eve-adapter.js";
import { readFile, writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("EveAdapter", () => {
  it("returns failed state on subprocess timeout without reading result file", async () => {
    const dir = path.join(tmpdir(), `eve-adapter-timeout-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const statePath = path.join(dir, "missing.json");
    const sleepScript = path.join(dir, "sleep.sh");
    await writeFile(sleepScript, "#!/usr/bin/env bash\nsleep 5\n", "utf8");
    await chmod(sleepScript, 0o755);

    const adapter = new EveAdapter(sleepScript, statePath, 300);
    const result = await adapter.dispatch({
      envelope: {
        traceId: "trace-timeout",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "hi",
      },
      intentRoute: "unified:test",
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("eve_dispatch_timeout");
    expect(result.failureClass).toBe("dispatch_failure");
    expect(result.traceId).toBe("trace-timeout");
    await expect(readFile(statePath, "utf8")).rejects.toThrow();
  });
});
