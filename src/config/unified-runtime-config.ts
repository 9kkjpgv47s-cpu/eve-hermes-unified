import path from "node:path";

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
  unifiedDispatchAuditLogPath: string;
  /** File path for durable dispatch replay queue (JSON). */
  dispatchDurabilityQueuePath: string;
  /**
   * Max dispatched/failed queue entries to retain (oldest pruned first); 0 = unlimited.
   * Pending entries are never pruned.
   */
  durabilityQueueRetentionNonTerminalMax: number;
  /** When true, wrap in-memory (or any) store with serialized writes for ordered mutation under concurrency. */
  unifiedMemorySerializeWrites: boolean;
  /** Wall-clock budget (ms) for capability executor body; 0 = unlimited. */
  capabilityExecutionTimeoutMs: number;
  capabilityPolicy: {
    defaultMode: "allow" | "deny";
    allowCapabilities: string[];
    denyCapabilities: string[];
    allowedChatIds: string[];
    deniedChatIds: string[];
    allowedTenantIds: string[];
    deniedTenantIds: string[];
    allowCapabilityChats: Record<string, string[]>;
    denyCapabilityChats: Record<string, string[]>;
  };
  preflight: {
    enabled: boolean;
    strict: boolean;
  };
  auditLogPath: string;
  /** Rotate active dispatch audit log when file exceeds this size (bytes); 0 = disabled. */
  auditRotationMaxBytes: number;
  /** Keep at most this many generations (active log + timestamped rotated siblings). */
  auditRotationRetainCount: number;
  /** Append-only JSONL log for capability policy authorization decisions (@cap). */
  capabilityPolicyAuditLogPath: string;
  /** Rotate capability policy audit JSONL when active file exceeds this size (bytes); 0 = disabled. */
  capabilityPolicyAuditRotationMaxBytes: number;
  /** Keep at most this many generations (active log + rotated siblings). */
  capabilityPolicyAuditRotationRetainCount: number;
  /** When non-empty, dispatch rejects envelopes whose tenantId is missing or not in this list. */
  tenantAllowlist: string[];
  /** Dispatch rejects envelopes whose tenantId is in this list. */
  tenantDenylist: string[];
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

const FAILURE_CLASS_SET = new Set<FailureClass>([
  "none",
  "provider_limit",
  "cooldown",
  "dispatch_failure",
  "state_unavailable",
  "policy_failure",
]);

function parsePositiveIntMs(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw), 10);
  if (Number.isFinite(n) && n > 0) {
    return n;
  }
  return fallback;
}

/** Parses non-negative integers; empty/missing uses fallback. */
function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? ""), 10);
  if (Number.isFinite(n) && n >= 0) {
    return Math.floor(n);
  }
  return fallback;
}

function parseNoFallbackFailureClasses(raw: string | undefined): FailureClass[] | undefined {
  const tokens = parseCsvList(raw);
  if (tokens.length === 0) {
    return undefined;
  }
  const out: FailureClass[] = [];
  for (const token of tokens) {
    const normalized = token.trim().toLowerCase().replace(/-/g, "_") as FailureClass;
    if (!FAILURE_CLASS_SET.has(normalized)) {
      continue;
    }
    out.push(normalized);
  }
  return out.length > 0 ? out : undefined;
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
  const unifiedMemorySerializeWrites = parseBooleanFlag(
    firstDefined(reader, ["UNIFIED_MEMORY_SERIALIZE_WRITES", "MEMORY_SERIALIZE_WRITES"]),
    false,
  );
  const capabilityExecutionTimeoutMs = parsePositiveIntMs(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS",
      "CAPABILITY_EXECUTION_TIMEOUT_MS",
    ]),
    0,
  );
  const unifiedDispatchAuditLogPath =
    firstDefined(reader, ["UNIFIED_DISPATCH_AUDIT_LOG_PATH", "DISPATCH_AUDIT_LOG_PATH"]) ??
    "/tmp/eve-hermes-unified-dispatch-audit.jsonl";
  const dispatchDurabilityQueuePath =
    firstDefined(reader, ["UNIFIED_DISPATCH_DURABILITY_QUEUE_PATH", "DISPATCH_QUEUE_PATH"]) ??
    "/tmp/eve-hermes-unified-dispatch-queue.json";
  const durabilityQueueRetentionNonTerminalMax = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_DISPATCH_DURABILITY_QUEUE_RETENTION_NON_TERMINAL_MAX",
      "DISPATCH_QUEUE_RETENTION_NON_TERMINAL_MAX",
    ]),
    5000,
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
  const capabilityAllowedTenantIdsRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_ALLOWED_TENANT_IDS",
    "CAPABILITY_ALLOWED_TENANT_IDS",
  ]);
  const capabilityDeniedTenantIdsRaw = firstDefined(reader, [
    "UNIFIED_CAPABILITY_DENIED_TENANT_IDS",
    "CAPABILITY_DENIED_TENANT_IDS",
  ]);
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
  const capabilityPolicyBaseline = createCapabilityPolicyConfigFromEnv({
    defaultModeRaw: capabilityDefaultModeRaw,
    allowCapabilitiesRaw: capabilityAllowListRaw,
    denyCapabilitiesRaw: capabilityDenyListRaw,
    allowedChatIdsRaw: capabilityAllowedChatIdsRaw,
    deniedChatIdsRaw: capabilityDeniedChatIdsRaw,
    allowedTenantIdsRaw: capabilityAllowedTenantIdsRaw,
    deniedTenantIdsRaw: capabilityDeniedTenantIdsRaw,
    allowCapabilityChatsRaw: undefined,
    denyCapabilityChatsRaw: undefined,
  });
  const dispatchAllowedTenantIds = parseCsvList(
    firstDefined(reader, ["UNIFIED_TENANT_ALLOWLIST", "UNIFIED_ALLOWED_TENANT_IDS"]),
  );
  const dispatchDeniedTenantIds = parseCsvList(
    firstDefined(reader, ["UNIFIED_TENANT_DENYLIST", "UNIFIED_DENIED_TENANT_IDS"]),
  );
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
  const auditRotationMaxBytes = parseNonNegativeInt(
    firstDefined(reader, ["UNIFIED_DISPATCH_AUDIT_ROTATION_MAX_BYTES", "UNIFIED_AUDIT_ROTATION_MAX_BYTES"]),
    0,
  );
  const auditRotationRetainCountRaw = parseNonNegativeInt(
    firstDefined(reader, ["UNIFIED_DISPATCH_AUDIT_ROTATION_RETAIN_COUNT", "UNIFIED_AUDIT_ROTATION_RETAIN_COUNT"]),
    8,
  );
  const auditRotationRetainCount = auditRotationRetainCountRaw <= 0 ? 1 : auditRotationRetainCountRaw;
  const capabilityPolicyAuditLogPath =
    firstDefined(reader, ["UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH", "CAPABILITY_POLICY_AUDIT_LOG_PATH"]) ??
    path.join(path.dirname(auditLogPath), "unified-capability-policy-audit.jsonl");
  const capabilityPolicyAuditRotationMaxBytes = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_MAX_BYTES",
      "CAPABILITY_POLICY_AUDIT_ROTATION_MAX_BYTES",
    ]),
    0,
  );
  const capabilityPolicyAuditRotationRetainCountRaw = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_RETAIN_COUNT",
      "CAPABILITY_POLICY_AUDIT_ROTATION_RETAIN_COUNT",
    ]),
    8,
  );
  const capabilityPolicyAuditRotationRetainCount =
    capabilityPolicyAuditRotationRetainCountRaw <= 0 ? 1 : capabilityPolicyAuditRotationRetainCountRaw;
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
  const hermesPrimaryChatIds = parseCsvList(
    firstDefined(reader, [
      "UNIFIED_ROUTER_HERMES_PRIMARY_CHAT_IDS",
      "ROUTER_HERMES_PRIMARY_CHAT_IDS",
    ]),
  );
  const noFallbackFailureClassesRaw = firstDefined(reader, [
    "UNIFIED_ROUTER_NO_FALLBACK_ON_FAILURE_CLASSES",
    "ROUTER_NO_FALLBACK_ON_FAILURE_CLASSES",
  ]);
  const noFallbackOnFailureClasses = parseNoFallbackFailureClasses(noFallbackFailureClassesRaw);
  const standbyRegionRaw = firstDefined(reader, ["UNIFIED_ROUTER_STANDBY_REGION", "ROUTER_STANDBY_REGION"]);
  const standbyRegion = standbyRegionRaw?.trim() ? standbyRegionRaw.trim() : undefined;

  return {
    eveDispatchScript,
    eveDispatchResultPath,
    hermesLaunchCommand,
    hermesLaunchArgs: hermesLaunchArgsRaw.split(/\s+/).filter(Boolean),
    unifiedMemoryStoreKind,
    unifiedMemoryFilePath,
    unifiedMemorySerializeWrites,
    capabilityExecutionTimeoutMs,
    unifiedDispatchAuditLogPath,
    dispatchDurabilityQueuePath,
    durabilityQueueRetentionNonTerminalMax,
    capabilityPolicy: {
      defaultMode: capabilityDefaultMode,
      allowCapabilities: capabilityPolicyBaseline.allowCapabilities,
      denyCapabilities: capabilityPolicyBaseline.denyCapabilities,
      allowedChatIds: capabilityPolicyBaseline.allowedChatIds,
      deniedChatIds: capabilityPolicyBaseline.deniedChatIds,
      allowedTenantIds: capabilityPolicyBaseline.allowedTenantIds,
      deniedTenantIds: capabilityPolicyBaseline.deniedTenantIds,
      allowCapabilityChats: capabilityAllowChatMap,
      denyCapabilityChats: capabilityDenyChatMap,
    },
    preflight: {
      enabled: preflightEnabled,
      strict: preflightStrict,
    },
    auditLogPath,
    auditRotationMaxBytes,
    auditRotationRetainCount,
    capabilityPolicyAuditLogPath,
    capabilityPolicyAuditRotationMaxBytes,
    capabilityPolicyAuditRotationRetainCount,
    tenantAllowlist: dispatchAllowedTenantIds,
    tenantDenylist: dispatchDeniedTenantIds,
    routerConfig: {
      defaultPrimary,
      defaultFallback,
      failClosed,
      policyVersion,
      noFallbackOnFailureClasses,
      hermesPrimaryChatIds,
      standbyRegion,
      cutoverStage,
      canaryChatIds,
      majorityPercent,
      hashSalt,
    },
  };
}

export function loadUnifiedRuntimeConfig(): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => process.env[name]);
}

export function loadUnifiedRuntimeConfigFromEnv(env: RuntimeEnvSnapshot): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => env[name]);
}
