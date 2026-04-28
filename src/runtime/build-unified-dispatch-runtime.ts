import path from "node:path";
import { fileURLToPath } from "node:url";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import type { UnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { createUnifiedMemoryStoreFromEnv } from "../memory/unified-memory-store.js";
import { createDefaultUnifiedCapabilityRegistry } from "../skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "./capability-engine.js";
import { registerDefaultCapabilityExecutors } from "./default-capability-handlers.js";
import { createCapabilityPolicy } from "./capability-policy.js";
import type { UnifiedRuntime } from "./unified-dispatch.js";

export type BuiltUnifiedDispatchRuntime = {
  config: UnifiedRuntimeEnvConfig;
  runtime: UnifiedRuntime;
};

/**
 * Shared wiring for unified-dispatch and replay tooling (H3 durable WAL).
 */
export function buildUnifiedDispatchRuntime(config: UnifiedRuntimeEnvConfig): BuiltUnifiedDispatchRuntime {
  const sharedMemoryStore = createUnifiedMemoryStoreFromEnv(
    config.unifiedMemoryStoreKind,
    config.unifiedMemoryFilePath,
    { dualWriteShadowFilePath: config.unifiedMemoryDualWriteFilePath },
  );
  const eveAdapter = new EveAdapter(config.eveDispatchScript, config.eveDispatchResultPath);
  const hermesAdapter = new HermesAdapter(config.hermesLaunchCommand, config.hermesLaunchArgs);
  const capabilityRegistry = createDefaultUnifiedCapabilityRegistry();
  const dispatchLane = async (input: {
    lane: "eve" | "hermes";
    text: string;
    intentRoute: string;
    chatId: string;
    messageId: string;
    traceId: string;
  }) => {
    const adapter = input.lane === "eve" ? eveAdapter : hermesAdapter;
    return adapter.dispatch({
      envelope: {
        channel: "telegram",
        chatId: input.chatId,
        messageId: input.messageId,
        text: input.text,
        traceId: input.traceId,
        receivedAtIso: new Date().toISOString(),
      },
      intentRoute: input.intentRoute,
    });
  };
  registerDefaultCapabilityExecutors(capabilityRegistry, {
    dispatchLane,
    memoryStore: sharedMemoryStore,
  });
  const capabilityPolicy = createCapabilityPolicy(config.capabilityPolicy);
  const capabilityEngine = new UnifiedCapabilityEngine(capabilityRegistry, {
    memoryStore: sharedMemoryStore,
    dispatchLane,
    policy: capabilityPolicy,
    capabilityExecutionTimeoutMs: config.unifiedCapabilityExecutionTimeoutMs,
  });
  const runtime: UnifiedRuntime = {
    eveAdapter,
    hermesAdapter,
    routerConfig: config.routerConfig,
    capabilityEngine,
    dispatchDefaults: {
      defaultTenantId: config.dispatchDefaultTenantId?.trim() || undefined,
      defaultRegionId: config.dispatchDefaultRegionId?.trim() || undefined,
    },
  };
  return { config, runtime };
}

export function resolveRepoRootFromImportMeta(importMetaUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), "../..");
}
