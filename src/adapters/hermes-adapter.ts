import { randomUUID } from "node:crypto";
import { runCommandWithTimeout } from "../process/exec.js";
import type { DispatchState } from "../contracts/types.js";
import { validateDispatchState } from "../contracts/validate.js";
import type { LaneAdapter, LaneDispatchInput } from "./lane-adapter.js";

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
  ) {}

  async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
    const runId = `unified-hermes-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const started = Date.now();

    const result = await runCommandWithTimeout(
      [this.launchCommand, ...this.launchArgs, input.envelope.text],
      {
        timeoutMs: this.timeoutMs,
        env: {
          HERMES_UNIFIED_TRACE_ID: input.envelope.traceId,
          HERMES_UNIFIED_CHAT_ID: input.envelope.chatId,
          HERMES_UNIFIED_MESSAGE_ID: input.envelope.messageId,
          HERMES_UNIFIED_INTENT_ROUTE: input.intentRoute,
        },
      },
    );

    const reason =
      result.termination === "timeout"
        ? "hermes_dispatch_timeout"
        : result.code === 0
          ? "hermes_dispatch_success"
          : `hermes_dispatch_exit_${result.code ?? "null"}`;
    const state: DispatchState = {
      status: result.code === 0 ? "pass" : "failed",
      reason,
      runtimeUsed: "hermes",
      runId,
      elapsedMs: Math.max(0, Date.now() - started),
      failureClass: result.code === 0 ? "none" : classifyHermesFailure(reason),
      sourceLane: "hermes",
      sourceChatId: input.envelope.chatId,
      sourceMessageId: input.envelope.messageId,
      traceId: input.envelope.traceId,
    };
    return validateDispatchState(state);
  }
}
