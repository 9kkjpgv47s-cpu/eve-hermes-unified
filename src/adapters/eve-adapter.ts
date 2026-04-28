import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runCommandWithTimeout } from "../process/exec.js";
import type { DispatchState } from "../contracts/types.js";
import { truncateLaneIo, validateDispatchState } from "../contracts/validate.js";
import { redactLaneIo } from "../config/lane-io-redact.js";
import type { LaneAdapter, LaneDispatchInput } from "./lane-adapter.js";

type EveDispatchStateFile = {
  status?: string;
  reason?: string;
  runtime_used?: string;
  run_id?: string;
  elapsed_ms?: number;
  trace_id?: string;
  source_chat_id?: string;
  source_message_id?: string;
};

function buildEveEnv(input: LaneDispatchInput, runId: string, dispatchStatePath: string): Record<string, string> {
  const base: Record<string, string> = {
    EVE_TASK_DISPATCH_RUN_ID: runId,
    EVE_TASK_DISPATCH_RESULT_PATH: dispatchStatePath,
    EVE_TASK_DISPATCH_TRACE_ID: input.envelope.traceId,
    EVE_TASK_DISPATCH_SOURCE_CHANNEL: input.envelope.channel,
    EVE_TASK_DISPATCH_CHAT_ID: input.envelope.chatId,
    EVE_TASK_DISPATCH_MESSAGE_ID: input.envelope.messageId,
    EVE_TASK_DISPATCH_INTENT_ROUTE: input.intentRoute,
  };
  if (input.memorySnapshot && Object.keys(input.memorySnapshot).length > 0) {
    base.EVE_UNIFIED_MEMORY_JSON = JSON.stringify(input.memorySnapshot);
  }
  if (input.capabilityIds && input.capabilityIds.length > 0) {
    base.EVE_UNIFIED_CAPABILITY_IDS = input.capabilityIds.join(",");
  }
  return base;
}

function classifyFailure(reason: string): DispatchState["failureClass"] {
  const lower = reason.toLowerCase();
  if (lower.includes("rate_limit") || lower.includes("api_rate_limited") || lower.includes("credits")) {
    return "provider_limit";
  }
  if (lower.includes("cooldown")) {
    return "cooldown";
  }
  if (lower.includes("state")) {
    return "state_unavailable";
  }
  if (lower.includes("policy")) {
    return "policy_failure";
  }
  return "dispatch_failure";
}

export class EveAdapter implements LaneAdapter {
  laneId: "eve" = "eve";

  constructor(
    private readonly dispatchScriptPath: string,
    private readonly dispatchStatePath: string,
    private readonly dispatchTimeoutMs = 180_000,
    private readonly laneIoRedact = false,
    private readonly laneIoRedactCustom = "",
  ) {}

  private capIo(out: string, err: string): { laneStdout: string; laneStderr: string } {
    return {
      laneStdout: truncateLaneIo(redactLaneIo(out, this.laneIoRedact, this.laneIoRedactCustom)),
      laneStderr: truncateLaneIo(redactLaneIo(err, this.laneIoRedact, this.laneIoRedactCustom)),
    };
  }

  async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
    const runId = `unified-eve-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    const result = await runCommandWithTimeout([this.dispatchScriptPath, input.envelope.text], {
      timeoutMs: this.dispatchTimeoutMs,
      env: {
        ...buildEveEnv(input, runId, this.dispatchStatePath),
      },
    });

    if (result.termination === "timeout") {
      const state: DispatchState = {
        status: "failed",
        reason: "eve_dispatch_timeout",
        runtimeUsed: "eve",
        runId,
        elapsedMs: Math.max(0, Date.now() - started),
        failureClass: "dispatch_failure",
        sourceLane: "eve",
        sourceChatId: input.envelope.chatId,
        sourceMessageId: input.envelope.messageId,
        traceId: input.envelope.traceId,
        ...this.capIo(result.stdout, result.stderr),
      };
      return validateDispatchState(state);
    }

    if (result.code !== 0) {
      const state: DispatchState = {
        status: "failed",
        reason: `eve_dispatch_exit_${result.code ?? "null"}`,
        runtimeUsed: "eve",
        runId,
        elapsedMs: Math.max(0, Date.now() - started),
        failureClass: "dispatch_failure",
        sourceLane: "eve",
        sourceChatId: input.envelope.chatId,
        sourceMessageId: input.envelope.messageId,
        traceId: input.envelope.traceId,
        ...this.capIo(result.stdout, result.stderr),
      };
      return validateDispatchState(state);
    }

    let raw: string;
    try {
      raw = await readFile(this.dispatchStatePath, "utf8");
    } catch {
      const state: DispatchState = {
        status: "failed",
        reason: "eve_dispatch_state_unreadable",
        runtimeUsed: "eve",
        runId,
        elapsedMs: Math.max(0, Date.now() - started),
        failureClass: "state_unavailable",
        sourceLane: "eve",
        sourceChatId: input.envelope.chatId,
        sourceMessageId: input.envelope.messageId,
        traceId: input.envelope.traceId,
      };
      return validateDispatchState(state);
    }

    let parsed: EveDispatchStateFile;
    try {
      parsed = JSON.parse(raw) as EveDispatchStateFile;
    } catch {
      const state: DispatchState = {
        status: "failed",
        reason: "eve_dispatch_state_invalid_json",
        runtimeUsed: "eve",
        runId,
        elapsedMs: Math.max(0, Date.now() - started),
        failureClass: "state_unavailable",
        sourceLane: "eve",
        sourceChatId: input.envelope.chatId,
        sourceMessageId: input.envelope.messageId,
        traceId: input.envelope.traceId,
      };
      return validateDispatchState(state);
    }

    const state: DispatchState = {
      status: parsed.status === "pass" ? "pass" : "failed",
      reason: parsed.reason ?? "unknown",
      runtimeUsed: parsed.runtime_used ?? "unknown",
      runId: parsed.run_id ?? runId,
      elapsedMs: Number.isFinite(parsed.elapsed_ms) ? Number(parsed.elapsed_ms) : 0,
      failureClass:
        parsed.status === "pass"
          ? "none"
          : classifyFailure(parsed.reason ?? "dispatch_failed"),
      sourceLane: "eve",
      sourceChatId: parsed.source_chat_id ?? input.envelope.chatId,
      sourceMessageId: parsed.source_message_id ?? input.envelope.messageId,
      traceId: parsed.trace_id ?? input.envelope.traceId,
    };
    return validateDispatchState(state);
  }
}
