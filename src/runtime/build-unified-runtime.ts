import path from "node:path";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import { CapabilityRegistry, defaultCapabilityCatalog } from "../capabilities/capability-registry.js";
import { loadDotEnvFile } from "../config/env.js";
import {
  assertUnifiedPathsConfigured,
  loadUnifiedControlPlaneEnv,
} from "../config/unified-control-plane-env.js";
import { InMemoryUnifiedMemoryStore } from "../memory/unified-memory-store.js";
import type { UnifiedRuntime } from "./unified-dispatch.js";

export async function buildUnifiedRuntimeFromEnv(rootDir: string): Promise<{
  runtime: UnifiedRuntime;
  gatewayMode: "unified" | "legacy";
}> {
  await loadDotEnvFile(rootDir);
  const c = loadUnifiedControlPlaneEnv();
  assertUnifiedPathsConfigured(c);

  const capabilityRegistry = new CapabilityRegistry();
  capabilityRegistry.registerAll(defaultCapabilityCatalog);

  const memoryStore = new InMemoryUnifiedMemoryStore();

  const runtime: UnifiedRuntime = {
    eveAdapter: new EveAdapter(c.eveTaskDispatchScript, c.eveDispatchResultPath, c.eveLaneTimeoutMs),
    hermesAdapter: new HermesAdapter(c.hermesLaunchCommand, c.hermesLaunchArgs, c.hermesLaneTimeoutMs),
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
