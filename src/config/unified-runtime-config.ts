import type { FailureClass, LaneId } from "../contracts/types.js";
import type { RouterPolicyConfig } from "../router/policy-router.js";

import type { UnifiedMemoryStoreKind } from "../memory/unified-memory-store.js";
import { createCapabilityPolicyConfigFromEnv, parseCapabilityChatMaps } from "../runtime/capability-policy.js";

export type UnifiedRuntimeEnvConfig = {
  eveDispatchScript: string;
  eveDispatchResultPath: string;
  hermesLaunchCommand: string;
  hermesLaunchArgs: string[];
  unifiedMemoryStoreKind: UnifiedMemoryStoreKind;
  unifiedMemoryFilePath: string;
  unifiedMemoryDualWriteFilePath?: string;
  dispatchDurableWalPath?: string;
  unifiedCapabilityExecutionTimeoutMs?: number;
  unifiedDispatchAuditLogPath: string;
  /** H5: when true, audit lines for tenant-bearing dispatches go to per-tenant files alongside the base path. */
  dispatchAuditTenantPartition?: boolean;
  /** H5: when set, rotate the active audit file before append if size exceeds this byte count. */
  dispatchAuditMaxBytesBeforeRotate?: number;
  /** H5: default tenant when CLI/envelope omits tenantId (optional). */
  dispatchDefaultTenantId?: string;
  /** H5: default region when CLI/envelope omits regionId (optional). */
  dispatchDefaultRegionId?: string;
  /** H5: when true, preflight requires a non-empty effective tenant id. */
  tenantIsolationStrict?: boolean;
  capabilityPolicy: {
    defaultMode: "allow" | "deny";
    allowCapabilities: string[];
    denyCapabilities: string[];
    allowedChatIds: string[];
    deniedChatIds: string[];
    allowCapabilityChats: Record<string, string[]>;
    denyCapabilityChats: Record<string, string[]>;
    allowCapabilityChatsByTenant?: Record<string, Record<string, string[]>>;
    denyCapabilityChatsByTenant?: Record<string, Record<string, string[]>>;
  };
  preflight: {
    enabled: boolean;
    strict: boolean;
  };
  auditLogPath: string;
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

function parseCsvList(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function parseCapabilityDefaultMode(raw: string | undefined): "allow" | "deny" {
  return raw?.toLowerCase() === "deny" ? "deny" : "allow";
}

function parseCutoverStage(raw: string | undefined): "shadow" | "canary" | "majority" | "full" {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized === "shadow" ||
    normalized === "canary" ||
    normalized === "majority" ||
    normalized === "full"
  ) {
    return normalized;
  }
  return "shadow";
}

function parsePercent(raw: string | undefined, fallback: number): number {
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric >= 0 && numeric <= 100) {
    return Math.floor(numeric);
  }
  return fallback;
}

function parsePositiveIntMs(raw: string | undefined): number | undefined {
  if (!raw?.trim()) {
    return undefined;
  }
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return n;
}

function parsePositiveInt(raw: string | undefined): number | undefined {
  return parsePositiveIntMs(raw);
}

function parseDispatchFallbackFailureClasses(raw: string | undefined): FailureClass[] {
  if (!raw?.trim()) {
    return [];
  }
  const allowed = new Set([
    "none",
    "provider_limit",
    "cooldown",
    "dispatch_failure",
    "state_unavailable",
    "policy_failure",
  ]);
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => allowed.has(s)) as FailureClass[];
}

export function loadUnifiedRuntimeEnvConfig(
  reader: Reader = (name) => process.env[name],
): UnifiedRuntimeEnvConfig {
  // Legacy keys are accepted as compatibility shims while converging control plane config.
  const eveDispatchScript =
    firstDefined(reader, ["UNIFIED_EVE_TASK_DISPATCH_SCRIPT", "EVE_TASK_DISPATCH_SCRIPT"]) ??
    "/Users/dominiceasterling/openclaw/scripts/" + "eve-task-dispatch.sh";
  const eveDispatchResultPath =
    firstDefined(reader, ["UNIFIED_EVE_DISPATCH_RESULT_PATH", "EVE_DISPATCH_RESULT_PATH"]) ??
    "/Users/dominiceasterling/.openclaw/state/" + "eve-task-dispatch-last.json";
  const hermesLaunchCommand =
    firstDefined(reader, ["UNIFIED_HERMES_LAUNCH_COMMAND", "HERMES_LAUNCH_COMMAND"]) ?? "python3";
  const hermesLaunchArgsRaw =
    firstDefined(reader, ["UNIFIED_HERMES_LAUNCH_ARGS", "HERMES_LAUNCH_ARGS"]) ??
    "-m hermes" + " " + "gateway";
  const unifiedMemoryStoreKind = parseMemoryStoreKind(
    firstDefined(reader, ["UNIFIED_MEMORY_STORE_KIND", "MEMORY_STORE_KIND"]),
  );
  const unifiedMemoryFilePath =
    firstDefined(reader, ["UNIFIED_MEMORY_FILE_PATH", "MEMORY_FILE_PATH"]) ??
    "/tmp/eve-hermes-unified-memory.json";
  const unifiedMemoryDualWriteFilePath = firstDefined(reader, [
    "UNIFIED_MEMORY_DUAL_WRITE_FILE_PATH",
    "UNIFIED_MEMORY_SHADOW_FILE_PATH",
  ]);
  const dispatchDurableWalPath = firstDefined(reader, [
    "UNIFIED_DISPATCH_DURABLE_WAL_PATH",
    "DISPATCH_DURABLE_WAL_PATH",
  ]);
  const unifiedCapabilityExecutionTimeoutMs = parsePositiveIntMs(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS",
      "CAPABILITY_EXECUTION_TIMEOUT_MS",
    ]),
  );
  const unifiedDispatchAuditLogPath =
    firstDefined(reader, ["UNIFIED_DISPATCH_AUDIT_LOG_PATH", "DISPATCH_AUDIT_LOG_PATH"]) ??
    "/tmp/eve-hermes-unified-dispatch-audit.jsonl";
  const dispatchAuditTenantPartition = parseBooleanFlag(
    firstDefined(reader, [
      "UNIFIED_DISPATCH_AUDIT_TENANT_PARTITION",
      "DISPATCH_AUDIT_TENANT_PARTITION",
    ]),
    false,
  );
  const dispatchAuditMaxBytesBeforeRotate = parsePositiveInt(
    firstDefined(reader, [
      "UNIFIED_DISPATCH_AUDIT_MAX_BYTES_BEFORE_ROTATE",
      "DISPATCH_AUDIT_MAX_BYTES_BEFORE_ROTATE",
    ]),
  );
  const capabilityDefaultModeRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_POLICY_MODE",
    "CAPABILITY_POLICY_MODE",
    "UNIFIED_CAPABILITY_POLICY_DEFAULT",
    "CAPABILITY_POLICY_DEFAULT",
  ]);
  const capabilityDefaultMode = parseCapabilityDefaultMode(
    capabilityDefaultModeRaw,
  );
  const capabilityAllowListRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_ALLOWLIST",
    "CAPABILITY_ALLOWLIST",
    "UNIFIED_CAPABILITY_ALLOW_LIST",
    "CAPABILITY_ALLOW_LIST",
    "UNIFIED_CAPABILITY_ALLOWED_IDS",
    "CAPABILITY_ALLOWED_IDS",
  ]);
  const capabilityAllowList = parseCsvList(
    capabilityAllowListRaw,
  );
  const capabilityDenyListRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_DENYLIST",
    "CAPABILITY_DENYLIST",
    "UNIFIED_CAPABILITY_DENY_LIST",
    "CAPABILITY_DENY_LIST",
    "UNIFIED_CAPABILITY_DENIED_IDS",
    "CAPABILITY_DENIED_IDS",
  ]);
  const capabilityDenyList = parseCsvList(
    capabilityDenyListRaw,
  );
  const capabilityAllowedChatIdsRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_CHAT_ALLOWLIST",
    "CAPABILITY_CHAT_ALLOWLIST",
    "UNIFIED_CAPABILITY_ALLOWED_CHAT_IDS",
    "CAPABILITY_ALLOWED_CHAT_IDS",
  ]);
  const capabilityAllowedChatIds = parseCsvList(
    capabilityAllowedChatIdsRaw,
  );
  const capabilityDeniedChatIdsRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_CHAT_DENYLIST",
    "CAPABILITY_CHAT_DENYLIST",
    "UNIFIED_CAPABILITY_DENIED_CHAT_IDS",
    "CAPABILITY_DENIED_CHAT_IDS",
  ]);
  const capabilityDeniedChatIds = parseCsvList(
    capabilityDeniedChatIdsRaw,
  );
  const capabilityAllowChatMap = parseCapabilityChatMaps(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_PER_CAPABILITY_CHAT_ALLOWLIST",
      "CAPABILITY_PER_CAPABILITY_CHAT_ALLOWLIST",
      "UNIFIED_CAPABILITY_ALLOW_CHAT_MAP",
      "CAPABILITY_ALLOW_CHAT_MAP",
    ]),
  );
  const capabilityDenyChatMap = parseCapabilityChatMaps(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_PER_CAPABILITY_CHAT_DENYLIST",
      "CAPABILITY_PER_CAPABILITY_CHAT_DENYLIST",
      "UNIFIED_CAPABILITY_DENY_CHAT_MAP",
      "CAPABILITY_DENY_CHAT_MAP",
    ]),
  );
  const capabilityAllowChatsByTenantRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_ALLOW_CHAT_IDS_BY_TENANT",
    "UNIFIED_CAPABILITY_PER_TENANT_CHAT_ALLOWLIST",
  ]);
  const capabilityDenyChatsByTenantRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_DENY_CHAT_IDS_BY_TENANT",
    "UNIFIED_CAPABILITY_PER_TENANT_CHAT_DENYLIST",
  ]);
  const dispatchDefaultTenantId = firstDefined(reader, [
    "UNIFIED_DISPATCH_DEFAULT_TENANT_ID",
    "UNIFIED_DISPATCH_TENANT_ID",
    "DISPATCH_DEFAULT_TENANT_ID",
  ]);
  const dispatchDefaultRegionId = firstDefined(reader, [
    "UNIFIED_DISPATCH_DEFAULT_REGION_ID",
    "UNIFIED_DISPATCH_REGION_ID",
    "DISPATCH_DEFAULT_REGION_ID",
  ]);
  const tenantIsolationStrict = parseBooleanFlag(
    firstDefined(reader, ["UNIFIED_TENANT_ISOLATION_STRICT", "TENANT_ISOLATION_STRICT"]),
    false,
  );
  const routerRegionId = firstDefined(reader, ["UNIFIED_ROUTER_REGION_ID", "ROUTER_REGION_ID"]);
  const capabilityPolicyBaseline = createCapabilityPolicyConfigFromEnv({
    defaultModeRaw: capabilityDefaultModeRaw,
    allowCapabilitiesRaw: capabilityAllowListRaw,
    denyCapabilitiesRaw: capabilityDenyListRaw,
    allowedChatIdsRaw: capabilityAllowedChatIdsRaw,
    deniedChatIdsRaw: capabilityDeniedChatIdsRaw,
    allowCapabilityChatsRaw: undefined,
    denyCapabilityChatsRaw: undefined,
    allowCapabilityChatsByTenantRaw: capabilityAllowChatsByTenantRaw,
    denyCapabilityChatsByTenantRaw: capabilityDenyChatsByTenantRaw,
  });
  const preflightEnabled = parseBooleanFlag(
    firstDefined(reader, [
      "UNIFIED_PREFLIGHT_ENABLED",
      "UNIFIED_ENABLE_PREFLIGHT_CHECKS",
      "PREFLIGHT_ENABLED",
    ]),
    true,
  );
  const preflightStrict = parseBooleanFlag(
    firstDefined(reader, ["UNIFIED_PREFLIGHT_STRICT", "PREFLIGHT_STRICT"]),
    true,
  );
  const auditLogPath =
    firstDefined(reader, ["UNIFIED_AUDIT_LOG_PATH", "AUDIT_LOG_PATH", "UNIFIED_DISPATCH_AUDIT_LOG_PATH", "DISPATCH_AUDIT_LOG_PATH"]) ??
    "/tmp/eve-hermes-unified-dispatch-audit.jsonl";
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
  const cutoverStage = parseCutoverStage(
    firstDefined(reader, [
      "UNIFIED_ROUTER_CUTOVER_STAGE",
      "ROUTER_CUTOVER_STAGE",
      "UNIFIED_ROUTER_STAGE",
      "ROUTER_STAGE",
    ]),
  );
  const canaryChatIds = parseCsvList(
    firstDefined(reader, ["UNIFIED_ROUTER_CANARY_CHAT_IDS", "ROUTER_CANARY_CHAT_IDS"]),
  );
  const majorityPercent = parsePercent(
    firstDefined(reader, [
      "UNIFIED_ROUTER_MAJORITY_HERMES_PERCENT",
      "ROUTER_MAJORITY_HERMES_PERCENT",
      "UNIFIED_ROUTER_MAJORITY_PERCENT",
      "ROUTER_MAJORITY_PERCENT",
    ]),
    90,
  );
  const hashSalt =
    firstDefined(reader, ["UNIFIED_ROUTER_HASH_SALT", "ROUTER_HASH_SALT"]) ?? "eve-hermes-unified";
  const dispatchFailureClassesAllowingFallback = parseDispatchFallbackFailureClasses(
    firstDefined(reader, [
      "UNIFIED_ROUTER_DISPATCH_FALLBACK_FAILURE_CLASSES",
      "ROUTER_DISPATCH_FALLBACK_FAILURE_CLASSES",
    ]),
  );

  return {
    eveDispatchScript,
    eveDispatchResultPath,
    hermesLaunchCommand,
    hermesLaunchArgs: hermesLaunchArgsRaw.split(/\s+/).filter(Boolean),
    unifiedMemoryStoreKind,
    unifiedMemoryFilePath,
    unifiedMemoryDualWriteFilePath,
    dispatchDurableWalPath,
    unifiedCapabilityExecutionTimeoutMs,
    unifiedDispatchAuditLogPath,
    dispatchAuditTenantPartition,
    dispatchAuditMaxBytesBeforeRotate,
    dispatchDefaultTenantId,
    dispatchDefaultRegionId,
    tenantIsolationStrict,
    capabilityPolicy: {
      defaultMode: capabilityDefaultMode,
      allowCapabilities: capabilityPolicyBaseline.allowCapabilities,
      denyCapabilities: capabilityPolicyBaseline.denyCapabilities,
      allowedChatIds: capabilityPolicyBaseline.allowedChatIds,
      deniedChatIds: capabilityPolicyBaseline.deniedChatIds,
      allowCapabilityChats: capabilityAllowChatMap,
      denyCapabilityChats: capabilityDenyChatMap,
      allowCapabilityChatsByTenant: capabilityPolicyBaseline.allowCapabilityChatsByTenant,
      denyCapabilityChatsByTenant: capabilityPolicyBaseline.denyCapabilityChatsByTenant,
    },
    preflight: {
      enabled: preflightEnabled,
      strict: preflightStrict,
    },
    auditLogPath,
    routerConfig: {
      defaultPrimary,
      defaultFallback,
      failClosed,
      policyVersion,
      cutoverStage,
      canaryChatIds,
      majorityPercent,
      hashSalt,
      dispatchFailureClassesAllowingFallback,
      routerRegionId: routerRegionId?.trim() || undefined,
    },
  };
}

export function loadUnifiedRuntimeConfig(): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => process.env[name]);
}

export function loadUnifiedRuntimeConfigFromEnv(env: RuntimeEnvSnapshot): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => env[name]);
}
