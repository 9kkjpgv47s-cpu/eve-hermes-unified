import type { LaneId } from "../contracts/types.js";
import type { RouterPolicyConfig } from "../router/policy-router.js";

import type { UnifiedMemoryStoreKind } from "../memory/unified-memory-store.js";

export type UnifiedRuntimeEnvConfig = {
  eveDispatchScript: string;
  eveDispatchResultPath: string;
  hermesLaunchCommand: string;
  hermesLaunchArgs: string[];
  unifiedMemoryStoreKind: UnifiedMemoryStoreKind;
  unifiedMemoryFilePath: string;
  routerConfig: RouterPolicyConfig;
};

export type RuntimeEnvSnapshot = Partial<Record<string, string>>;

type Reader = (name: string) => string | undefined;

function firstDefined(reader: Reader, names: string[]): string | undefined {
  for (const name of names) {
    const value = reader(name)?.trim();
    if (value && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function parseLane(raw: string | undefined, fallback: LaneId): LaneId {
  if (raw === "eve" || raw === "hermes") {
    return raw;
  }
  return fallback;
}

function parseFallbackLane(raw: string | undefined, fallback: LaneId | "none"): LaneId | "none" {
  if (raw === "none") {
    return "none";
  }
  return parseLane(raw, fallback === "none" ? "hermes" : fallback);
}

function parseBooleanFlag(raw: string | undefined, fallback: boolean): boolean {
  if (raw === "1" || raw?.toLowerCase() === "true") {
    return true;
  }
  if (raw === "0" || raw?.toLowerCase() === "false") {
    return false;
  }
  return fallback;
}

function parseMemoryStoreKind(raw: string | undefined): UnifiedMemoryStoreKind {
  return raw === "memory" ? "memory" : "file";
}

export function loadUnifiedRuntimeEnvConfig(
  reader: Reader = (name) => process.env[name],
): UnifiedRuntimeEnvConfig {
  // Legacy keys are accepted as compatibility shims while converging control plane config.
  const eveDispatchScript =
    firstDefined(reader, ["UNIFIED_EVE_TASK_DISPATCH_SCRIPT", "EVE_TASK_DISPATCH_SCRIPT"]) ??
    "/Users/dominiceasterling/openclaw/scripts/eve-task-dispatch.sh";
  const eveDispatchResultPath =
    firstDefined(reader, ["UNIFIED_EVE_DISPATCH_RESULT_PATH", "EVE_DISPATCH_RESULT_PATH"]) ??
    "/Users/dominiceasterling/.openclaw/state/eve-task-dispatch-last.json";
  const hermesLaunchCommand =
    firstDefined(reader, ["UNIFIED_HERMES_LAUNCH_COMMAND", "HERMES_LAUNCH_COMMAND"]) ?? "python3";
  const hermesLaunchArgsRaw =
    firstDefined(reader, ["UNIFIED_HERMES_LAUNCH_ARGS", "HERMES_LAUNCH_ARGS"]) ?? "-m hermes gateway";
  const unifiedMemoryStoreKind = parseMemoryStoreKind(
    firstDefined(reader, ["UNIFIED_MEMORY_STORE_KIND", "MEMORY_STORE_KIND"]),
  );
  const unifiedMemoryFilePath =
    firstDefined(reader, ["UNIFIED_MEMORY_FILE_PATH", "MEMORY_FILE_PATH"]) ??
    "/tmp/eve-hermes-unified-memory.json";
  const defaultPrimary = parseLane(
    firstDefined(reader, ["UNIFIED_ROUTER_DEFAULT_PRIMARY", "ROUTER_DEFAULT_PRIMARY"]),
    "eve",
  );
  const defaultFallback = parseFallbackLane(
    firstDefined(reader, ["UNIFIED_ROUTER_DEFAULT_FALLBACK", "ROUTER_DEFAULT_FALLBACK"]),
    "hermes",
  );
  const failClosed = parseBooleanFlag(
    firstDefined(reader, ["UNIFIED_ROUTER_FAIL_CLOSED", "ROUTER_FAIL_CLOSED"]),
    true,
  );
  const policyVersion = firstDefined(reader, ["UNIFIED_ROUTER_POLICY_VERSION", "ROUTER_POLICY_VERSION"]) ?? "v1";

  return {
    eveDispatchScript,
    eveDispatchResultPath,
    hermesLaunchCommand,
    hermesLaunchArgs: hermesLaunchArgsRaw.split(/\s+/).filter(Boolean),
    unifiedMemoryStoreKind,
    unifiedMemoryFilePath,
    routerConfig: {
      defaultPrimary,
      defaultFallback,
      failClosed,
      policyVersion,
    },
  };
}

export function loadUnifiedRuntimeConfig(): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => process.env[name]);
}

export function loadUnifiedRuntimeConfigFromEnv(env: RuntimeEnvSnapshot): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => env[name]);
}
