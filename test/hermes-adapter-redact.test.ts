import { describe, expect, it } from "vitest";
import { HermesAdapter } from "../src/adapters/hermes-adapter.js";
import { writeFile, mkdir, chmod } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

describe("HermesAdapter redaction", () => {
  it("redacts bearer tokens in stderr when enabled", async () => {
    const dir = path.join(tmpdir(), `hermes-redact-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const script = path.join(dir, "leak.sh");
    await writeFile(
      script,
      "#!/usr/bin/env bash\necho 'Authorization: Bearer supersecret123' >&2\nexit 1\n",
      "utf8",
    );
    await chmod(script, 0o755);

    const adapter = new HermesAdapter("bash", [script], 5000, true, "");
    const state = await adapter.dispatch({
      envelope: {
        traceId: "t-red",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: new Date().toISOString(),
        text: "x",
      },
      intentRoute: "unified:test",
    });
    expect(state.laneStderr).toContain("[REDACTED]");
    expect(state.laneStderr).not.toContain("supersecret");
  });
});
