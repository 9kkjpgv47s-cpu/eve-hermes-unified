import type { LaneId } from "../contracts/types.js";

export type UnifiedControlPlaneEnv = {
  eveTaskDispatchScript: string;
  eveDispatchResultPath: string;
  eveLaneTimeoutMs: number;
  hermesLaunchCommand: string;
  hermesLaunchArgs: string[];
  hermesLaneTimeoutMs: number;
  routerDefaultPrimary: LaneId;
  routerDefaultFallback: LaneId | "none";
  routerFailClosed: boolean;
  routerPolicyVersion: string;
  gatewayMode: "unified" | "legacy";
};

function parseIntBounded(raw: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function parseLane(value: string, fallback: LaneId): LaneId {
  return value === "hermes" ? "hermes" : value === "eve" ? "eve" : fallback;
}

function parseFallbackLane(value: string): LaneId | "none" {
  if (value === "none") {
    return "none";
  }
  return parseLane(value, "hermes");
}

/**
 * Legacy env names (Phase 5 shims): applied only when the canonical variable is unset.
 */
export function applyLegacyUnifiedEnvShims(): void {
  const setIfUnset = (canonical: string, value: string | undefined) => {
    if (value && process.env[canonical] === undefined) {
      process.env[canonical] = value;
    }
  };
  setIfUnset("EVE_TASK_DISPATCH_SCRIPT", process.env.EVE_DISPATCH_SCRIPT);
  setIfUnset("EVE_DISPATCH_RESULT_PATH", process.env.EVE_RESULT_PATH);
  setIfUnset("HERMES_LAUNCH_COMMAND", process.env.HERMES_CMD);
  setIfUnset("UNIFIED_ROUTER_DEFAULT_PRIMARY", process.env.ROUTER_PRIMARY);
  setIfUnset("UNIFIED_ROUTER_DEFAULT_FALLBACK", process.env.ROUTER_FALLBACK);
  setIfUnset("UNIFIED_ROUTER_FAIL_CLOSED", process.env.ROUTER_FAIL_CLOSED);
}

function env(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

export function loadUnifiedControlPlaneEnv(): UnifiedControlPlaneEnv {
  applyLegacyUnifiedEnvShims();

  const launchArgs = env("HERMES_LAUNCH_ARGS", "-m hermes gateway")
    .split(/\s+/)
    .filter(Boolean);

  const gatewayRaw = env("UNIFIED_TELEGRAM_GATEWAY_MODE", "unified").toLowerCase();
  const gatewayMode: "unified" | "legacy" = gatewayRaw === "legacy" ? "legacy" : "unified";

  return {
    eveTaskDispatchScript: env(
      "EVE_TASK_DISPATCH_SCRIPT",
      "/Users/dominiceasterling/openclaw/scripts/eve-task-dispatch.sh",
    ),
    eveDispatchResultPath: env(
      "EVE_DISPATCH_RESULT_PATH",
      "/Users/dominiceasterling/.openclaw/state/eve-task-dispatch-last.json",
    ),
    eveLaneTimeoutMs: parseIntBounded(env("EVE_LANE_TIMEOUT_MS", "180000"), 180_000, 1_000, 3_600_000),
    hermesLaunchCommand: env("HERMES_LAUNCH_COMMAND", "python3"),
    hermesLaunchArgs: launchArgs,
    hermesLaneTimeoutMs: parseIntBounded(env("HERMES_LANE_TIMEOUT_MS", "180000"), 180_000, 1_000, 3_600_000),
    routerDefaultPrimary: parseLane(env("UNIFIED_ROUTER_DEFAULT_PRIMARY", "eve"), "eve"),
    routerDefaultFallback: parseFallbackLane(env("UNIFIED_ROUTER_DEFAULT_FALLBACK", "hermes")),
    routerFailClosed: env("UNIFIED_ROUTER_FAIL_CLOSED", "1") === "1",
    routerPolicyVersion: env("UNIFIED_ROUTER_POLICY_VERSION", "v1"),
    gatewayMode,
  };
}

export function assertUnifiedPathsConfigured(c: UnifiedControlPlaneEnv): void {
  if (!c.eveTaskDispatchScript.trim()) {
    throw new Error("EVE_TASK_DISPATCH_SCRIPT is required.");
  }
  if (!c.eveDispatchResultPath.trim()) {
    throw new Error("EVE_DISPATCH_RESULT_PATH is required.");
  }
  if (!c.hermesLaunchCommand.trim()) {
    throw new Error("HERMES_LAUNCH_COMMAND is required.");
  }
}
