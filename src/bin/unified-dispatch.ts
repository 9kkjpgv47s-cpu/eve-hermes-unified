#!/usr/bin/env node
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { createUnifiedMemoryStoreFromEnv } from "../memory/unified-memory-store.js";
import { createDefaultUnifiedCapabilityRegistry } from "../skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "../runtime/capability-engine.js";
import { registerDefaultCapabilityExecutors } from "../runtime/default-capability-handlers.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { createCapabilityPolicy } from "../runtime/capability-policy.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import { maybeRotateDispatchAuditLog } from "../runtime/audit-log-rotation.js";
import {
  FileDispatchDurabilityQueue,
  replayPendingDispatches,
} from "../runtime/dispatch-durability-queue.js";

export type UnifiedDispatchCliArgs = {
  text: string;
  chatId: string;
  messageId: string;
  tenantId: string;
  regionId: string;
  compactJson: boolean;
  enqueueFailedPrimary: boolean;
  replayQueue: boolean;
};

export function parseUnifiedDispatchCliArgs(argv: string[]): UnifiedDispatchCliArgs {
  let text = "";
  let chatId = "0";
  let messageId = "0";
  let tenantId = "";
  let regionId = "";
  let compactJson = false;
  let enqueueFailedPrimary = false;
  let replayQueue = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--text") {
      text = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--chat-id") {
      chatId = argv[i + 1] ?? "0";
      i += 1;
    } else if (arg === "--message-id") {
      messageId = argv[i + 1] ?? "0";
      i += 1;
    } else if (arg === "--tenant-id") {
      tenantId = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--region-id") {
      regionId = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--compact-json") {
      compactJson = true;
    } else if (arg === "--enqueue-failed-primary") {
      enqueueFailedPrimary = true;
    } else if (arg === "--replay-queue") {
      replayQueue = true;
    }
  }
  if (!replayQueue && !text.trim()) {
    throw new Error("Missing required --text argument.");
  }
  return { text, chatId, messageId, tenantId, regionId, compactJson, enqueueFailedPrimary, replayQueue };
}

function primaryFailedNeedingRecovery(
  result: Awaited<ReturnType<typeof dispatchUnifiedMessage>>,
): boolean {
  if (result.primaryState.status !== "failed") {
    return false;
  }
  if (result.capabilityExecution) {
    return result.capabilityExecution.status === "failed";
  }
  const routing = result.routing;
  return routing.fallbackLane !== "none" && !routing.failClosed;
}

async function buildDispatchRuntime(): Promise<{
  runtime: Parameters<typeof dispatchUnifiedMessage>[0];
  config: ReturnType<typeof loadUnifiedRuntimeEnvConfig>;
}> {
  const config = loadUnifiedRuntimeEnvConfig();
  const baseMemoryStore = createUnifiedMemoryStoreFromEnv(
    config.unifiedMemoryStoreKind,
    config.unifiedMemoryFilePath,
    { serializeWrites: config.unifiedMemorySerializeWrites },
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
    tenantId?: string;
    regionId?: string;
  }) => {
    const adapter = input.lane === "eve" ? eveAdapter : hermesAdapter;
    const envelope = {
      channel: "telegram" as const,
      chatId: input.chatId,
      messageId: input.messageId,
      text: input.text,
      traceId: input.traceId,
      receivedAtIso: new Date().toISOString(),
      ...(input.tenantId?.trim() ? { tenantId: input.tenantId.trim() } : {}),
      ...(input.regionId?.trim() ? { regionId: input.regionId.trim() } : {}),
    };
    return adapter.dispatch({
      envelope,
      intentRoute: input.intentRoute,
    });
  };
  registerDefaultCapabilityExecutors(capabilityRegistry, {
    dispatchLane,
    memoryStore: baseMemoryStore,
  });
  const capabilityPolicy = createCapabilityPolicy(config.capabilityPolicy);
  const capabilityEngine = new UnifiedCapabilityEngine(capabilityRegistry, {
    memoryStore: baseMemoryStore,
    dispatchLane,
    policy: capabilityPolicy,
    capabilityPolicyAuditLogPath: config.capabilityPolicyAuditLogPath,
    executionTimeoutMs:
      config.capabilityExecutionTimeoutMs > 0 ? config.capabilityExecutionTimeoutMs : undefined,
  });

  const preflightIssues = await runRuntimePreflight({
    enabled: config.preflight.enabled,
    strict: config.preflight.strict,
    eveDispatchScript: config.eveDispatchScript,
    eveDispatchResultPath: config.eveDispatchResultPath,
    hermesLaunchCommand: config.hermesLaunchCommand,
    unifiedMemoryStoreKind: config.unifiedMemoryStoreKind,
    unifiedMemoryFilePath: config.unifiedMemoryFilePath,
    auditEnabled: true,
    auditLogPath: config.unifiedDispatchAuditLogPath,
    capabilityPolicyAuditLogPath: config.capabilityPolicyAuditLogPath,
  });
  if (preflightIssues.length > 0) {
    const reasons = preflightIssues.join("; ");
    throw new Error(`Runtime preflight failed: ${reasons}`);
  }

  const runtime = {
    eveAdapter,
    hermesAdapter,
    routerConfig: config.routerConfig,
    capabilityEngine,
    tenantAllowlist: config.tenantAllowlist,
    tenantDenylist: config.tenantDenylist,
  };
  return { runtime, config };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  await loadDotEnvFile(rootDir);
  const args = parseUnifiedDispatchCliArgs(process.argv.slice(2));
  const { text, chatId, messageId, tenantId, regionId, compactJson, enqueueFailedPrimary, replayQueue } = args;

  const { runtime, config } = await buildDispatchRuntime();
  const durabilityQueue = new FileDispatchDurabilityQueue(config.dispatchDurabilityQueuePath);

  if (replayQueue) {
    const replayed = await replayPendingDispatches(runtime, durabilityQueue);
    const payload = compactJson ? JSON.stringify(replayed) : JSON.stringify(replayed, null, 2);
    process.stdout.write(`${payload}\n`);
    return;
  }

  const result = await dispatchUnifiedMessage(runtime, {
    channel: "telegram",
    chatId,
    messageId,
    text,
    ...(tenantId.trim() ? { tenantId: tenantId.trim() } : {}),
    ...(regionId.trim() ? { regionId: regionId.trim() } : {}),
  });

  let durability:
    | { queued: false }
    | { queued: true; queueEntryId: string; reason: string }
    | undefined;

  if (enqueueFailedPrimary && primaryFailedNeedingRecovery(result)) {
    const queueEntryId = await durabilityQueue.appendEnvelope(result.envelope);
    durability = {
      queued: true,
      queueEntryId,
      reason: "primary_failed_cross_lane_recovery_pending",
    };
  }

  const output = durability !== undefined ? { ...result, durability } : result;

  if (config.auditRotationMaxBytes > 0) {
    await maybeRotateDispatchAuditLog(config.unifiedDispatchAuditLogPath, {
      maxBytes: config.auditRotationMaxBytes,
      retainCount: config.auditRotationRetainCount,
    });
  }
  await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, output);
  const payload = compactJson ? JSON.stringify(output) : JSON.stringify(output, null, 2);
  process.stdout.write(`${payload}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisFile = fileURLToPath(import.meta.url);
if (entryPath && entryPath === thisFile) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
