import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  FileDispatchDurabilityQueue,
  replayPendingDispatches,
} from "../src/runtime/dispatch-durability-queue.js";
import type { DispatchState, UnifiedMessageEnvelope } from "../src/contracts/types.js";
import type { LaneAdapter, LaneDispatchInput } from "../src/adapters/lane-adapter.js";
import type { RouterPolicyConfig } from "../src/router/policy-router.js";

class RecordingLaneAdapter implements LaneAdapter {
  public readonly dispatches: LaneDispatchInput[] = [];

  constructor(
    public laneId: "eve" | "hermes",
    private readonly response: DispatchState,
  ) {}

  async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
    this.dispatches.push(input);
    return this.response;
  }
}

function envelopeFixture(traceId: string): UnifiedMessageEnvelope {
  return {
    traceId,
    channel: "telegram",
    chatId: "1",
    messageId: "2",
    receivedAtIso: new Date().toISOString(),
    text: "replay me",
  };
}

describe("replay max attempts per durability queue entry", () => {
  it("marks failed when pending entry attempts already exceed cap before replay increment", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "dq-replay-cap-"));
    const queuePath = path.join(dir, "queue.json");
    try {
      await mkdir(dir, { recursive: true });
      await writeFile(
        queuePath,
        `${JSON.stringify({
          version: 1,
          entries: [
            {
              id: "stuck-pending",
              enqueuedAtIso: "2020-01-01T00:00:00.000Z",
              attempts: 5,
              status: "pending",
              envelope: envelopeFixture("t-stuck"),
            },
          ],
        })}\n`,
        "utf8",
      );

      const queue = new FileDispatchDurabilityQueue(queuePath, 0, 5);
      const eve = new RecordingLaneAdapter(
        "eve",
        {
          status: "pass",
          reason: "ok",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-stuck",
        },
      );
      const hermes = new RecordingLaneAdapter(
        "hermes",
        {
          status: "pass",
          reason: "ok",
          runtimeUsed: "hermes",
          runId: "r2",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "hermes",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-stuck",
        },
      );
      const routerConfig: RouterPolicyConfig = {
        defaultPrimary: "eve",
        defaultFallback: "hermes",
        failClosed: false,
        policyVersion: "v1",
      };

      const results = await replayPendingDispatches({ eveAdapter: eve, hermesAdapter: hermes, routerConfig }, queue);
      expect(results).toHaveLength(0);
      expect(eve.dispatches).toHaveLength(0);

      const raw = await readFile(queuePath, "utf8");
      const parsed = JSON.parse(raw) as { entries: { id: string; status: string; lastError?: string }[] };
      const row = parsed.entries.find((e) => e.id === "stuck-pending");
      expect(row?.status).toBe("failed");
      expect(row?.lastError).toContain("replay_max_attempts_exceeded");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("allows replay when attempts are below cap", async () => {
    const queuePath = path.join(os.tmpdir(), `dq-replay-ok-${Date.now()}.json`);
    const queue = new FileDispatchDurabilityQueue(queuePath, 0, 10);
    const traceId = "under-cap";
    await queue.appendEnvelope(envelopeFixture(traceId));

    const eve = new RecordingLaneAdapter(
      "eve",
      {
        status: "pass",
        reason: "ok",
        runtimeUsed: "eve",
        runId: "r1",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "eve",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId,
      },
    );
    const hermes = new RecordingLaneAdapter(
      "hermes",
      {
        status: "pass",
        reason: "ok",
        runtimeUsed: "hermes",
        runId: "r2",
        elapsedMs: 1,
        failureClass: "none",
        sourceLane: "hermes",
        sourceChatId: "1",
        sourceMessageId: "2",
        traceId,
      },
    );
    const routerConfig: RouterPolicyConfig = {
      defaultPrimary: "eve",
      defaultFallback: "hermes",
      failClosed: false,
      policyVersion: "v1",
    };

    const replayed = await replayPendingDispatches({ eveAdapter: eve, hermesAdapter: hermes, routerConfig }, queue);
    expect(replayed).toHaveLength(1);
    await rm(queuePath, { force: true }).catch(() => {});
  });
});
