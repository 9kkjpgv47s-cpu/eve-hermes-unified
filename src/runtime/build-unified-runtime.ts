import path from "node:path";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import { CapabilityRegistry, defaultCapabilityCatalog } from "../capabilities/capability-registry.js";
import { loadDotEnvFile } from "../config/env.js";
import {
  assertUnifiedControlPlaneEnv,
  loadUnifiedControlPlaneEnv,
} from "../config/unified-control-plane-env.js";
import { loadUnifiedConfigFile } from "../config/load-unified-config-file.js";
import { FileBackedUnifiedMemoryStore } from "../memory/file-backed-unified-memory-store.js";
import { InMemoryUnifiedMemoryStore } from "../memory/unified-memory-store.js";
import type { UnifiedRuntime } from "./unified-dispatch.js";

export async function buildUnifiedRuntimeFromEnv(rootDir: string): Promise<{
  runtime: UnifiedRuntime;
  gatewayMode: "unified" | "legacy";
}> {
  await loadDotEnvFile(rootDir);
  await loadUnifiedConfigFile(rootDir);
  const c = loadUnifiedControlPlaneEnv();
  assertUnifiedControlPlaneEnv(c);

  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.registerAll(defaultCapabilityCatalog);

  const memoryPath = path.isAbsolute(c.memoryFilePath) ? c.memoryFilePath : path.join(rootDir, c.memoryFilePath);
  const memoryStore =
    c.memoryBackend === "file" ? new FileBackedUnifiedMemoryStore(memoryPath) : new InMemoryUnifiedMemoryStore();

  const runtime: UnifiedRuntime = {
    eveAdapter: new EveAdapter(
      c.eveTaskDispatchScript,
      c.eveDispatchResultPath,
      c.eveLaneTimeoutMs,
      c.unifiedLaneIoRedact,
      c.unifiedLaneIoRedactCustom,
    ),
    hermesAdapter: new HermesAdapter(
      c.hermesLaunchCommand,
      c.hermesLaunchArgs,
      c.hermesLaneTimeoutMs,
      c.unifiedLaneIoRedact,
      c.unifiedLaneIoRedactCustom,
    ),
    routerConfig: {
      defaultPrimary: c.routerDefaultPrimary,
      defaultFallback: c.routerDefaultFallback,
      failClosed: c.routerFailClosed,
      policyVersion: c.routerPolicyVersion,
    },
    memoryStore,
    capabilityRegistry,
  };

  return { runtime, gatewayMode: c.gatewayMode };
}

export function defaultEvidenceDir(rootDir: string): string {
  return path.join(rootDir, "evidence");
}
