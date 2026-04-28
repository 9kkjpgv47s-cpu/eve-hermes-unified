import { randomUUID } from "node:crypto";
import { runCommandWithTimeout } from "../process/exec.js";
import type { DispatchState } from "../contracts/types.js";
import { validateDispatchState } from "../contracts/validate.js";
import type { LaneAdapter, LaneDispatchInput } from "./lane-adapter.js";

function classifyHermesFailure(reason: string): DispatchState["failureClass"] {
  const lower = reason.toLowerCase();
  if (lower.includes("aborted")) {
    return "dispatch_failure";
  }
  const exitMatch = lower.match(/hermes_dispatch_exit_(\d+)/);
  const exitCode = exitMatch ? Number(exitMatch[1]) : Number.NaN;
  if (Number.isFinite(exitCode) && exitCode >= 128) {
    // Shells commonly encode signal termination as 128 + signal number.
    return "provider_limit";
  }
  if (
    lower.includes("429") ||
    lower.includes("rate") ||
    lower.includes("credit") ||
    lower.includes("provider_limit")
  ) {
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
    let result;
    try {
      const env: Record<string, string> = {
            HERMES_UNIFIED_TRACE_ID: input.envelope.traceId,
            HERMES_UNIFIED_CHAT_ID: input.envelope.chatId,
            HERMES_UNIFIED_MESSAGE_ID: input.envelope.messageId,
            HERMES_UNIFIED_INTENT_ROUTE: input.intentRoute,
          };
      if (input.envelope.tenantId && input.envelope.tenantId.trim().length > 0) {
        env.UNIFIED_TENANT_ID = input.envelope.tenantId.trim();
      }
      result = await runCommandWithTimeout(
        [this.launchCommand, ...this.launchArgs, input.envelope.text],
        {
          timeoutMs: this.timeoutMs,
          env,
          signal: input.signal,
        },
      );
    } catch {
      result = {
        stdout: "",
        stderr: "",
        code: null,
        signal: null,
        termination: "signal" as const,
      };
    }

    const failureText = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.toLowerCase();
    const inferredFailureReason = failureText.includes("provider_limit")
      || failureText.includes("429")
      || failureText.includes("rate_limit")
      || failureText.includes("rate limited")
      || failureText.includes("credit")
      ? "hermes_provider_limit"
      : failureText.includes("cooldown")
        ? "hermes_cooldown"
        : failureText.includes("state_unavailable") || failureText.includes("state mismatch")
          ? "hermes_state_unavailable"
          : failureText.includes("policy")
            ? "hermes_policy_failure"
            : null;
    const reason = result.termination === "timeout"
      ? "hermes_dispatch_timeout"
      : result.termination === "signal"
        ? "hermes_dispatch_aborted"
        : result.code === 0
        ? "hermes_dispatch_success"
        : inferredFailureReason
          ?? (result.code === null ? "hermes_dispatch_state_unavailable" : `hermes_dispatch_exit_${result.code}`);
    const state: DispatchState = {
      status: result.code === 0 && result.termination === "exit" ? "pass" : "failed",
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
