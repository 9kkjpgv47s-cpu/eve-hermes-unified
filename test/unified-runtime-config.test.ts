import { describe, expect, it } from "vitest";
import {
  loadUnifiedRuntimeEnvConfig,
} from "../src/config/unified-runtime-config.js";

type EnvSnapshot = Record<string, string>;

function baseEnv(overrides?: EnvSnapshot): EnvSnapshot {
  return {
    UNIFIED_ROUTER_DEFAULT_PRIMARY: "eve",
    UNIFIED_ROUTER_DEFAULT_FALLBACK: "hermes",
    UNIFIED_ROUTER_FAIL_CLOSED: "1",
    EVE_TASK_DISPATCH_SCRIPT: "/tmp/eve.sh",
    EVE_DISPATCH_RESULT_PATH: "/tmp/eve.json",
    HERMES_LAUNCH_COMMAND: "/bin/true",
    HERMES_LAUNCH_ARGS: "",
    ...overrides,
  };
}

function readFrom(envSnapshot: EnvSnapshot): (name: string) => string | undefined {
  return (name) => envSnapshot[name];
}

describe("loadUnifiedRuntimeEnvConfig", () => {
  it("uses unified env keys when present", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_DEFAULT_PRIMARY: "hermes",
          UNIFIED_ROUTER_DEFAULT_FALLBACK: "none",
          UNIFIED_ROUTER_FAIL_CLOSED: "0",
        }),
      ),
    );
    expect(config.routerConfig.defaultPrimary).toBe("hermes");
    expect(config.routerConfig.defaultFallback).toBe("none");
    expect(config.routerConfig.failClosed).toBe(false);
    expect(config.routerConfig.policyVersion).toBe("v1");
    expect(config.tenantAllowlist).toEqual([]);
    expect(config.tenantDenylist).toEqual([]);
  });

  it("supports legacy-compatible fallback names for router defaults", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_DEFAULT_PRIMARY: "",
          UNIFIED_ROUTER_DEFAULT_FALLBACK: "",
          UNIFIED_ROUTER_FAIL_CLOSED: "",
          ROUTER_DEFAULT_PRIMARY: "eve",
          ROUTER_DEFAULT_FALLBACK: "none",
          ROUTER_FAIL_CLOSED: "0",
        }),
      ),
    );
    expect(config.routerConfig.defaultPrimary).toBe("eve");
    expect(config.routerConfig.defaultFallback).toBe("none");
    expect(config.routerConfig.failClosed).toBe(false);
  });

  it("supports hermes launch command aliases", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          HERMES_LAUNCH_COMMAND: "",
          HERMES_LAUNCH_ARGS: "",
          UNIFIED_HERMES_LAUNCH_COMMAND: "python3",
          UNIFIED_HERMES_LAUNCH_ARGS: "-m hermes gateway",
        }),
      ),
    );
    expect(config.hermesLaunchCommand).toBe("python3");
    expect(config.hermesLaunchArgs).toEqual(["-m", "hermes", "gateway"]);
  });

  it("parses unified memory store settings", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_MEMORY_STORE_KIND: "memory",
          UNIFIED_MEMORY_FILE_PATH: "/tmp/custom-memory.json",
        }),
      ),
    );
    expect(config.unifiedMemoryStoreKind).toBe("memory");
    expect(config.unifiedMemoryFilePath).toBe("/tmp/custom-memory.json");
  });

  it("parses capability policy controls", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_CAPABILITY_POLICY_DEFAULT: "deny",
          UNIFIED_CAPABILITY_ALLOW_LIST: "check_status,summarize_state",
          UNIFIED_CAPABILITY_ALLOWED_CHAT_IDS: "100,200",
          UNIFIED_CAPABILITY_DENY_LIST: "hermes_dispatch_task",
          UNIFIED_CAPABILITY_DENIED_CHAT_IDS: "999",
        }),
      ),
    );
    expect(config.capabilityPolicy.defaultMode).toBe("deny");
    expect(config.capabilityPolicy.allowCapabilities).toEqual([
      "check_status",
      "summarize_state",
    ]);
    expect(config.capabilityPolicy.denyCapabilities).toEqual(["hermes_dispatch_task"]);
    expect(config.capabilityPolicy.allowedChatIds).toEqual(["100", "200"]);
    expect(config.capabilityPolicy.deniedChatIds).toEqual(["999"]);
  });

  it("parses preflight and audit log controls", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_PREFLIGHT_ENABLED: "1",
          UNIFIED_PREFLIGHT_STRICT: "0",
          UNIFIED_AUDIT_LOG_PATH: "/tmp/unified-audit.jsonl",
        }),
      ),
    );
    expect(config.preflight.enabled).toBe(true);
    expect(config.preflight.strict).toBe(false);
    expect(config.auditLogPath).toBe("/tmp/unified-audit.jsonl");
    expect(config.auditRotationMaxBytes).toBe(0);
    expect(config.auditRotationRetainCount).toBe(8);
  });

  it("parses audit rotation max bytes and retain count", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_DISPATCH_AUDIT_ROTATION_MAX_BYTES: "1048576",
          UNIFIED_DISPATCH_AUDIT_ROTATION_RETAIN_COUNT: "4",
        }),
      ),
    );
    expect(config.auditRotationMaxBytes).toBe(1048576);
    expect(config.auditRotationRetainCount).toBe(4);
  });

  it("coerces retain count below 1 to 1", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_DISPATCH_AUDIT_ROTATION_MAX_BYTES: "100",
          UNIFIED_DISPATCH_AUDIT_ROTATION_RETAIN_COUNT: "0",
        }),
      ),
    );
    expect(config.auditRotationRetainCount).toBe(1);
  });

  it("defaults capability policy audit log beside unified audit path", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_AUDIT_LOG_PATH: "/var/log/unified/dispatch-audit.jsonl",
        }),
      ),
    );
    expect(config.capabilityPolicyAuditLogPath).toBe("/var/log/unified/unified-capability-policy-audit.jsonl");
  });

  it("parses explicit capability policy audit log path", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_CAPABILITY_POLICY_AUDIT_LOG_PATH: "/tmp/explicit-cap-policy.jsonl",
        }),
      ),
    );
    expect(config.capabilityPolicyAuditLogPath).toBe("/tmp/explicit-cap-policy.jsonl");
  });

  it("parses cutover stage controls and aliases", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_CUTOVER_STAGE: "majority",
          UNIFIED_ROUTER_CANARY_CHAT_IDS: "chat-1,chat-2",
          UNIFIED_ROUTER_MAJORITY_PERCENT: "35",
          UNIFIED_ROUTER_HASH_SALT: "salt-1",
          PREFLIGHT_ENABLED: "0",
        }),
      ),
    );
    expect(config.routerConfig.cutoverStage).toBe("majority");
    expect(config.routerConfig.canaryChatIds).toEqual(["chat-1", "chat-2"]);
    expect(config.routerConfig.majorityPercent).toBe(35);
    expect(config.routerConfig.hashSalt).toBe("salt-1");
    expect(config.preflight.enabled).toBe(false);
  });

  it("parses dispatch durability queue path and alias", () => {
    const fromUnified = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_DISPATCH_DURABILITY_QUEUE_PATH: "/tmp/queue-a.json",
        }),
      ),
    );
    expect(fromUnified.dispatchDurabilityQueuePath).toBe("/tmp/queue-a.json");

    const fromAlias = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_DISPATCH_DURABILITY_QUEUE_PATH: "",
          DISPATCH_QUEUE_PATH: "/tmp/queue-b.json",
        }),
      ),
    );
    expect(fromAlias.dispatchDurabilityQueuePath).toBe("/tmp/queue-b.json");
  });

  it("parses durability queue retention max for non-terminal entries", () => {
    const defaults = loadUnifiedRuntimeEnvConfig(readFrom(baseEnv({})));
    expect(defaults.durabilityQueueRetentionNonTerminalMax).toBe(5000);

    const zero = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_DISPATCH_DURABILITY_QUEUE_RETENTION_NON_TERMINAL_MAX: "0",
        }),
      ),
    );
    expect(zero.durabilityQueueRetentionNonTerminalMax).toBe(0);

    const capped = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          DISPATCH_QUEUE_RETENTION_NON_TERMINAL_MAX: "100",
        }),
      ),
    );
    expect(capped.durabilityQueueRetentionNonTerminalMax).toBe(100);
  });

  it("parses Hermes-primary chat allowlist", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_HERMES_PRIMARY_CHAT_IDS: "vip-1, vip-2 ",
        }),
      ),
    );
    expect(config.routerConfig.hermesPrimaryChatIds).toEqual(["vip-1", "vip-2"]);
  });

  it("parses no-fallback-on-failure-classes", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_NO_FALLBACK_ON_FAILURE_CLASSES: "policy_failure, dispatch_failure,unknown",
        }),
      ),
    );
    expect(config.routerConfig.noFallbackOnFailureClasses).toEqual(["policy_failure", "dispatch_failure"]);
  });

  it("parses standby region and tenant dispatch lists", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_STANDBY_REGION: "eu-west-backup",
          UNIFIED_TENANT_ALLOWLIST: "org-a, org-b",
          UNIFIED_TENANT_DENYLIST: "blocked",
          UNIFIED_CAPABILITY_ALLOWED_TENANT_IDS: "org-a",
          UNIFIED_CAPABILITY_DENIED_TENANT_IDS: "blocked",
        }),
      ),
    );
    expect(config.routerConfig.standbyRegion).toBe("eu-west-backup");
    expect(config.tenantAllowlist).toEqual(["org-a", "org-b"]);
    expect(config.tenantDenylist).toEqual(["blocked"]);
    expect(config.capabilityPolicy.allowedTenantIds).toEqual(["org-a"]);
    expect(config.capabilityPolicy.deniedTenantIds).toEqual(["blocked"]);
  });

  it("parses memory serialize writes and capability execution timeout", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_MEMORY_SERIALIZE_WRITES: "1",
          UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS: "120000",
        }),
      ),
    );
    expect(config.unifiedMemorySerializeWrites).toBe(true);
    expect(config.capabilityExecutionTimeoutMs).toBe(120000);
  });
});
