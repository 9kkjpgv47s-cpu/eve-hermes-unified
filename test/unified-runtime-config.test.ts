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

  it("parses unified memory journal path", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_MEMORY_JOURNAL_PATH: "/tmp/mem.journal",
        }),
      ),
    );
    expect(config.unifiedMemoryJournalPath).toBe("/tmp/mem.journal");
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
  });

  it("parses audit log rotation byte limits", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_AUDIT_LOG_ROTATION_MAX_BYTES: "10485760",
          UNIFIED_AUDIT_LOG_ROTATION_RETAIN_BYTES: "2097152",
        }),
      ),
    );
    expect(config.auditLogRotationMaxBytes).toBe(10_485_760);
    expect(config.auditLogRotationRetainBytes).toBe(2_097_152);
  });

  it("parses capability execution timeout", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_CAPABILITY_EXECUTION_TIMEOUT_MS: "120000",
        }),
      ),
    );
    expect(config.capabilityExecutionTimeoutMs).toBe(120_000);
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
});
