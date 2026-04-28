import { randomUUID } from "node:crypto";
import { runCommandWithTimeout } from "../process/exec.js";
import type { DispatchState } from "../contracts/types.js";
import { truncateLaneIo, validateDispatchState } from "../contracts/validate.js";
import { redactLaneIo } from "../config/lane-io-redact.js";
import { applyHermesStructuredDiagnostics } from "./hermes-stderr-protocol.js";
import type { LaneAdapter, LaneDispatchInput } from "./lane-adapter.js";

function buildHermesEnv(input: LaneDispatchInput): Record<string, string> {
  const base: Record<string, string> = {
    HERMES_UNIFIED_TRACE_ID: input.envelope.traceId,
    HERMES_UNIFIED_CHAT_ID: input.envelope.chatId,
    HERMES_UNIFIED_MESSAGE_ID: input.envelope.messageId,
    HERMES_UNIFIED_INTENT_ROUTE: input.intentRoute,
  };
  if (input.memorySnapshot && Object.keys(input.memorySnapshot).length > 0) {
    base.HERMES_UNIFIED_MEMORY_JSON = JSON.stringify(input.memorySnapshot);
  }
  if (input.capabilityIds && input.capabilityIds.length > 0) {
    base.HERMES_UNIFIED_CAPABILITY_IDS = input.capabilityIds.join(",");
  }
  return base;
}

function classifyHermesFailure(reason: string): DispatchState["failureClass"] {
  const lower = reason.toLowerCase();
  if (lower.includes("429") || lower.includes("rate") || lower.includes("credit")) {
    return "provider_limit";
  }
  if (lower.includes("cooldown")) {
    return "cooldown";
  }
  if (lower.includes("policy")) {
    return "policy_failure";
  }
  return "dispatch_failure";
}

export class HermesAdapter implements LaneAdapter {
  laneId: "hermes" = "hermes";

  constructor(
    private readonly launchCommand: string,
    private readonly launchArgs: string[],
    private readonly timeoutMs = 180_000,
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
    const runId = `unified-hermes-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const started = Date.now();

    const result = await runCommandWithTimeout([this.launchCommand, ...this.launchArgs, input.envelope.text], {
      timeoutMs: this.timeoutMs,
      env: {
        ...buildHermesEnv(input),
      },
    });

    const reason =
      result.termination === "timeout"
        ? "hermes_dispatch_timeout"
        : result.code === 0
          ? "hermes_dispatch_success"
          : `hermes_dispatch_exit_${result.code ?? "null"}`;
    const state: DispatchState = {
      status: result.termination === "timeout" || result.code !== 0 ? "failed" : "pass",
      reason,
      runtimeUsed: "hermes",
      runId,
      elapsedMs: Math.max(0, Date.now() - started),
      failureClass:
        result.code === 0 && result.termination !== "timeout"
          ? "none"
          : result.termination === "timeout"
            ? "dispatch_failure"
            : classifyHermesFailure(reason),
      sourceLane: "hermes",
      sourceChatId: input.envelope.chatId,
      sourceMessageId: input.envelope.messageId,
      traceId: input.envelope.traceId,
      ...this.capIo(result.stdout, result.stderr),
    };
    return validateDispatchState(applyHermesStructuredDiagnostics(state, result.stderr));
  }
}
