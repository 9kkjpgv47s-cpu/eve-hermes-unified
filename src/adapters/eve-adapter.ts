import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { runCommandWithTimeout } from "../process/exec.js";
import type { DispatchState } from "../contracts/types.js";
import { validateDispatchState } from "../contracts/validate.js";
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
  ) {}

  async dispatch(input: LaneDispatchInput): Promise<DispatchState> {
    const runId = `unified-eve-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const started = Date.now();
    const commandResult = await runCommandWithTimeout([this.dispatchScriptPath, input.envelope.text], {
      timeoutMs: this.dispatchTimeoutMs,
      env: {
        EVE_TASK_DISPATCH_RUN_ID: runId,
        EVE_TASK_DISPATCH_RESULT_PATH: this.dispatchStatePath,
        EVE_TASK_DISPATCH_TRACE_ID: input.envelope.traceId,
        EVE_TASK_DISPATCH_SOURCE_CHANNEL: input.envelope.channel,
        EVE_TASK_DISPATCH_CHAT_ID: input.envelope.chatId,
        EVE_TASK_DISPATCH_MESSAGE_ID: input.envelope.messageId,
        EVE_TASK_DISPATCH_INTENT_ROUTE: input.intentRoute,
      },
    });

    let parsed: EveDispatchStateFile | null = null;
    try {
      const raw = await readFile(this.dispatchStatePath, "utf8");
      parsed = JSON.parse(raw) as EveDispatchStateFile;
    } catch {
      parsed = null;
    }
    const isPass = parsed?.status === "pass" && commandResult.code === 0;
    const reasonFromExit = commandResult.termination === "timeout"
      ? "eve_dispatch_timeout"
      : `eve_dispatch_exit_${commandResult.code ?? "null"}`;
    const fallbackReason = parsed?.reason ?? reasonFromExit;
    const state: DispatchState = {
      status: isPass ? "pass" : "failed",
      reason: fallbackReason,
      runtimeUsed: parsed?.runtime_used ?? "eve",
      runId: parsed?.run_id ?? runId,
      elapsedMs:
        Number.isFinite(parsed?.elapsed_ms) && Number(parsed?.elapsed_ms) >= 0
          ? Number(parsed?.elapsed_ms)
          : Math.max(0, Date.now() - started),
      failureClass: isPass ? "none" : classifyFailure(fallbackReason),
      sourceLane: "eve",
      sourceChatId: parsed?.source_chat_id ?? input.envelope.chatId,
      sourceMessageId: parsed?.source_message_id ?? input.envelope.messageId,
      traceId: parsed?.trace_id ?? input.envelope.traceId,
    };
    return validateDispatchState(state);
  }
}
