import { describe, expect, it } from "vitest";
import { HermesAdapter } from "../src/adapters/hermes-adapter.js";
import { writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("HermesAdapter lane I/O", () => {
  it("captures stderr on non-zero exit", async () => {
    const dir = path.join(tmpdir(), `hermes-io-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const script = path.join(dir, "err.sh");
    await writeFile(script, "#!/usr/bin/env bash\necho err1 >&2\nexit 3\n", "utf8");
    await chmod(script, 0o755);

    const adapter = new HermesAdapter("bash", [script], 5000);
    const state = await adapter.dispatch({
      envelope: {
        traceId: "t-io",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "x",
      },
      intentRoute: "unified:test",
      memorySnapshot: { k: "v" },
      capabilityIds: ["hermes.gateway"],
    });

    expect(state.status).toBe("failed");
    expect(state.laneStderr).toContain("err1");
  });
});
