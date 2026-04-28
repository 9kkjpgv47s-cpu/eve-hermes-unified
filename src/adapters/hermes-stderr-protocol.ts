import type { DispatchState } from "../contracts/types.js";

const PREFIX = "UNIFIED_HERMES_JSON:";

type HermesDiagPayload = {
  failureClass?: string;
  reason?: string;
};

export function parseHermesStructuredStderr(stderr: string): HermesDiagPayload | undefined {
  for (const line of stderr.split(/\r?\n/)) {
    const idx = line.indexOf(PREFIX);
    if (idx < 0) {
      continue;
    }
    const jsonPart = line.slice(idx + PREFIX.length).trim();
    if (!jsonPart) {
      continue;
    }
    try {
      const parsed = JSON.parse(jsonPart) as HermesDiagPayload;
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

const validFailure: ReadonlySet<DispatchState["failureClass"]> = new Set([
  "none",
  "provider_limit",
  "cooldown",
  "dispatch_failure",
  "state_unavailable",
  "policy_failure",
]);

export function applyHermesStructuredDiagnostics(
  state: DispatchState,
  stderr: string,
): DispatchState {
  if (state.status !== "failed") {
    return state;
  }
  const diag = parseHermesStructuredStderr(stderr);
  if (!diag) {
    return state;
  }
  let failureClass = state.failureClass;
  if (diag.failureClass && validFailure.has(diag.failureClass as DispatchState["failureClass"])) {
    failureClass = diag.failureClass as DispatchState["failureClass"];
  }
  let reason = state.reason;
  if (diag.reason?.trim()) {
    reason = `${state.reason}|hermes_stderr:${diag.reason.trim().slice(0, 500)}`;
  }
  return { ...state, failureClass, reason };
}
