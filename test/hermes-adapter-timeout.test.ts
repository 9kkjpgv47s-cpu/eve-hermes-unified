import { describe, expect, it } from "vitest";
import { HermesAdapter } from "../src/adapters/hermes-adapter.js";
import { writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("HermesAdapter", () => {
  it("classifies subprocess timeout as failed dispatch", async () => {
    const dir = path.join(tmpdir(), `hermes-adapter-timeout-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const sleepScript = path.join(dir, "sleep.sh");
    await writeFile(sleepScript, "#!/usr/bin/env bash\nsleep 5\n", "utf8");
    await chmod(sleepScript, 0o755);

    const adapter = new HermesAdapter("bash", [sleepScript], 300);
    const result = await adapter.dispatch({
      envelope: {
        traceId: "h-trace",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "hi",
      },
      intentRoute: "unified:test",
    });

    expect(result.status).toBe("failed");
    expect(result.reason).toBe("hermes_dispatch_timeout");
    expect(result.failureClass).toBe("dispatch_failure");
  });
});
