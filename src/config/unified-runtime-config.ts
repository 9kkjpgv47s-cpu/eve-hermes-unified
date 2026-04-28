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
  /** Optional append-only journal for file-backed memory (crash recovery between snapshot persists). */
  unifiedMemoryJournalPath: string;
  unifiedDispatchAuditLogPath: string;
  /** Optional append-only JSONL for capability policy denials and config fingerprint events. */
  capabilityPolicyAuditLogPath: string;
  /** When true, append policy_config_loaded on startup only if fingerprint changed vs last line in audit log. */
  capabilityPolicyAuditVerifyLoad: boolean;
  /** When > 0, rotate capability policy audit log before append if file exceeds this many bytes. */
  capabilityPolicyAuditRotationMaxBytes: number;
  /** Bytes of tail to keep in the primary policy audit log after rotation (line-aligned). */
  capabilityPolicyAuditRotationRetainBytes: number;
  capabilityPolicy: {
    defaultMode: "allow" | "deny";
    allowCapabilities: string[];
    denyCapabilities: string[];
    allowedChatIds: string[];
    deniedChatIds: string[];
    allowCapabilityChats: Record<string, string[]>;
    denyCapabilityChats: Record<string, string[]>;
  };
  preflight: {
    enabled: boolean;
    strict: boolean;
  };
  auditLogPath: string;
  /** When > 0, rotate dispatch audit log before append if file exceeds this many bytes. */
  auditLogRotationMaxBytes: number;
  /** Bytes of tail to keep in the primary log after rotation (line-aligned). */
  auditLogRotationRetainBytes: number;
  /** Optional append-only JSONL for router policy events (e.g. no-fallback-on-class). */
  routerTelemetryLogPath: string;
  /** When > 0, rotate router telemetry log before append if file exceeds this many bytes. */
  routerTelemetryRotationMaxBytes: number;
  /** Bytes of tail to keep in the primary router telemetry log after rotation (line-aligned). */
  routerTelemetryRotationRetainBytes: number;
  /** When > 0, fail capability execution if the handler does not settle within this many ms. */
  capabilityExecutionTimeoutMs: number;
  /** When true with a positive execution timeout, SIGTERM lane subprocess on budget expiry. */
  capabilityAbortLaneOnTimeout: boolean;
  /** When true, reject dispatches that omit a tenant id (after metadata resolution). */
  tenantStrict: boolean;
  /** When non-empty, only these tenant ids are accepted (fail-closed for others). */
  tenantAllowlist: string[];
  /**
   * When true with a configured memory store, require a valid tenant id and route all capability
   * memory through a tenant-prefixed view (fail-closed cross-tenant access to shared namespaces).
   */
  tenantMemoryIsolation: boolean;
  /** When true with file store + journal, re-read disk after each persist and verify snapshot matches memory. */
  unifiedMemoryVerifyPersist: boolean;
  /** When true with file store + journal, before each persist verify snapshot+WAL replay matches in-memory map. */
  unifiedMemoryVerifyJournalReplay: boolean;
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

function normalizeTenantAllowlistEntry(raw: string): string | undefined {
  const t = raw.trim();
  if (!t || t.length > 128) {
    return undefined;
  }
  if (t.includes("/") || t.includes("\\")) {
    return undefined;
  }
  return t;
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

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

const FAILURE_CLASS_SET = new Set<string>([
  "none",
  "provider_limit",
  "cooldown",
  "dispatch_failure",
  "state_unavailable",
  "policy_failure",
]);

function parseFailureClassList(raw: string | undefined): FailureClass[] {
  if (!raw) {
    return [];
  }
  const out: FailureClass[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!t) {
      continue;
    }
    if (FAILURE_CLASS_SET.has(t)) {
      out.push(t as FailureClass);
    }
  }
  return out;
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
  const unifiedMemoryJournalPath =
    firstDefined(reader, ["UNIFIED_MEMORY_JOURNAL_PATH", "MEMORY_JOURNAL_PATH"]) ?? "";
  const unifiedDispatchAuditLogPath =
    firstDefined(reader, ["UNIFIED_DISPATCH_AUDIT_LOG_PATH", "DISPATCH_AUDIT_LOG_PATH"]) ??
    "/tmp/eve-hermes-unified-dispatch-audit.jsonl";
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
  const capabilityPolicyBaseline = createCapabilityPolicyConfigFromEnv({
    defaultModeRaw: capabilityDefaultModeRaw,
    allowCapabilitiesRaw: capabilityAllowListRaw,
    denyCapabilitiesRaw: capabilityDenyListRaw,
    allowedChatIdsRaw: capabilityAllowedChatIdsRaw,
    deniedChatIdsRaw: capabilityDeniedChatIdsRaw,
    allowCapabilityChatsRaw: undefined,
    denyCapabilityChatsRaw: undefined,
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
  const capabilityPolicyAuditLogPath =
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH",
      "CAPABILITY_POLICY_AUDIT_LOG_PATH",
    ]) ?? "";
  const capabilityPolicyAuditVerifyLoad = parseBooleanFlag(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_POLICY_AUDIT_VERIFY_LOAD",
      "CAPABILITY_POLICY_AUDIT_VERIFY_LOAD",
    ]),
    capabilityPolicyAuditLogPath.length > 0,
  );
  const capabilityPolicyAuditRotationMaxBytes = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_MAX_BYTES",
      "CAPABILITY_POLICY_AUDIT_ROTATION_MAX_BYTES",
    ]),
    0,
  );
  const capabilityPolicyAuditRotationRetainBytes = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_POLICY_AUDIT_ROTATION_RETAIN_BYTES",
      "CAPABILITY_POLICY_AUDIT_ROTATION_RETAIN_BYTES",
    ]),
    0,
  );
  const auditLogRotationMaxBytes = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_AUDIT_LOG_ROTATION_MAX_BYTES",
      "AUDIT_LOG_ROTATION_MAX_BYTES",
      "UNIFIED_DISPATCH_AUDIT_LOG_ROTATION_MAX_BYTES",
    ]),
    0,
  );
  const auditLogRotationRetainBytes = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_AUDIT_LOG_ROTATION_RETAIN_BYTES",
      "AUDIT_LOG_ROTATION_RETAIN_BYTES",
      "UNIFIED_DISPATCH_AUDIT_LOG_ROTATION_RETAIN_BYTES",
    ]),
    0,
  );
  const routerTelemetryLogPath =
    firstDefined(reader, [
      "UNIFIED_ROUTER_TELEMETRY_LOG_PATH",
      "ROUTER_TELEMETRY_LOG_PATH",
    ]) ?? "";
  const routerTelemetryRotationMaxBytes = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_ROUTER_TELEMETRY_ROTATION_MAX_BYTES",
      "ROUTER_TELEMETRY_ROTATION_MAX_BYTES",
    ]),
    0,
  );
  const routerTelemetryRotationRetainBytes = parseNonNegativeInt(
    firstDefined(reader, [
      "UNIFIED_ROUTER_TELEMETRY_ROTATION_RETAIN_BYTES",
      "ROUTER_TELEMETRY_ROTATION_RETAIN_BYTES",
    ]),
    0,
  );
  const capabilityExecutionTimeoutMs = Math.min(
    86_400_000,
    parseNonNegativeInt(
      firstDefined(reader, [
        "UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS",
        "CAPABILITY_EXECUTION_TIMEOUT_MS",
      ]),
      0,
    ),
  );
  const capabilityAbortLaneOnTimeout = parseBooleanFlag(
    firstDefined(reader, [
      "UNIFIED_CAPABILITY_ABORT_LANE_ON_TIMEOUT",
      "CAPABILITY_ABORT_LANE_ON_TIMEOUT",
    ]),
    false,
  );
  const tenantStrict = parseBooleanFlag(
    firstDefined(reader, ["UNIFIED_TENANT_STRICT", "TENANT_STRICT"]),
    false,
  );
  const tenantAllowlist = parseCsvList(
    firstDefined(reader, ["UNIFIED_TENANT_ALLOWLIST", "TENANT_ALLOWLIST"]),
  )
    .map((entry) => normalizeTenantAllowlistEntry(entry))
    .filter((entry): entry is string => entry !== undefined);
  const tenantMemoryIsolation = parseBooleanFlag(
    firstDefined(reader, ["UNIFIED_TENANT_MEMORY_ISOLATION", "TENANT_MEMORY_ISOLATION"]),
    false,
  );
  const unifiedMemoryVerifyPersist = parseBooleanFlag(
    firstDefined(reader, [
      "UNIFIED_MEMORY_VERIFY_PERSIST",
      "MEMORY_VERIFY_PERSIST",
    ]),
    false,
  );
  const unifiedMemoryVerifyJournalReplay = parseBooleanFlag(
    firstDefined(reader, [
      "UNIFIED_MEMORY_VERIFY_JOURNAL_REPLAY",
      "MEMORY_VERIFY_JOURNAL_REPLAY",
    ]),
    false,
  );
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
  const noFallbackOnPrimaryFailureClasses = parseFailureClassList(
    firstDefined(reader, [
      "UNIFIED_ROUTER_NO_FALLBACK_ON_PRIMARY_FAILURE_CLASSES",
      "ROUTER_NO_FALLBACK_ON_PRIMARY_FAILURE_CLASSES",
    ]),
  );

  return {
    eveDispatchScript,
    eveDispatchResultPath,
    hermesLaunchCommand,
    hermesLaunchArgs: hermesLaunchArgsRaw.split(/\s+/).filter(Boolean),
    unifiedMemoryStoreKind,
    unifiedMemoryFilePath,
    unifiedMemoryJournalPath,
    unifiedDispatchAuditLogPath,
    capabilityPolicyAuditLogPath,
    capabilityPolicyAuditVerifyLoad,
    capabilityPolicyAuditRotationMaxBytes,
    capabilityPolicyAuditRotationRetainBytes,
    capabilityPolicy: {
      defaultMode: capabilityDefaultMode,
      allowCapabilities: capabilityPolicyBaseline.allowCapabilities,
      denyCapabilities: capabilityPolicyBaseline.denyCapabilities,
      allowedChatIds: capabilityPolicyBaseline.allowedChatIds,
      deniedChatIds: capabilityPolicyBaseline.deniedChatIds,
      allowCapabilityChats: capabilityAllowChatMap,
      denyCapabilityChats: capabilityDenyChatMap,
    },
    preflight: {
      enabled: preflightEnabled,
      strict: preflightStrict,
    },
    auditLogPath,
    auditLogRotationMaxBytes,
    auditLogRotationRetainBytes,
    routerTelemetryLogPath,
    routerTelemetryRotationMaxBytes,
    routerTelemetryRotationRetainBytes,
    capabilityExecutionTimeoutMs,
    capabilityAbortLaneOnTimeout,
    tenantStrict,
    tenantAllowlist,
    tenantMemoryIsolation,
    unifiedMemoryVerifyPersist,
    unifiedMemoryVerifyJournalReplay,
    routerConfig: {
      defaultPrimary,
      defaultFallback,
      failClosed,
      policyVersion,
      cutoverStage,
      canaryChatIds,
      majorityPercent,
      hashSalt,
      noFallbackOnPrimaryFailureClasses,
    },
  };
}

export function loadUnifiedRuntimeConfig(): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => process.env[name]);
}

export function loadUnifiedRuntimeConfigFromEnv(env: RuntimeEnvSnapshot): UnifiedRuntimeEnvConfig {
  return loadUnifiedRuntimeEnvConfig((name) => env[name]);
}
