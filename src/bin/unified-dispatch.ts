#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { createUnifiedMemoryStoreFromEnv } from "../memory/unified-memory-store.js";
import { createDefaultUnifiedCapabilityRegistry } from "../skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "../runtime/capability-engine.js";
import { registerDefaultCapabilityExecutors } from "../runtime/default-capability-handlers.js";
import {
  createUnifiedEnvelopeForDispatch,
  dispatchUnifiedEnvelope,
} from "../runtime/unified-dispatch.js";
import { FileDispatchDurabilityQueue, replayPendingDispatches } from "../runtime/dispatch-durability-queue.js";
import { createCapabilityPolicy } from "../runtime/capability-policy.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";

type CliArgs = {
  text: string;
  chatId: string;
  messageId: string;
  enqueueOnly: boolean;
  replayQueue: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  let text = "";
  let chatId = "0";
  let messageId = "0";
  let enqueueOnly = false;
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
    } else if (arg === "--enqueue-only") {
      enqueueOnly = true;
    } else if (arg === "--replay-queue") {
      replayQueue = true;
    }
  }
  return { text, chatId, messageId, enqueueOnly, replayQueue };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  await loadDotEnvFile(rootDir);
  const args = parseArgs(process.argv.slice(2));
  const config = loadUnifiedRuntimeEnvConfig();
  const sharedMemoryStore = createUnifiedMemoryStoreFromEnv(
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
    executionTimeoutMs: config.capabilityExecutionTimeoutMs,
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
  };

  const queue = new FileDispatchDurabilityQueue(config.dispatchDurabilityQueuePath);

  if (args.replayQueue) {
    const replay = await replayPendingDispatches(queue, runtime);
    process.stdout.write(`${JSON.stringify({ mode: "replay_queue", ...replay }, null, 2)}\n`);
    return;
  }

  if (!args.text.trim()) {
    throw new Error("Missing required --text argument.");
  }

  const envelope = createUnifiedEnvelopeForDispatch({
    channel: "telegram",
    chatId: args.chatId,
    messageId: args.messageId,
    text: args.text,
  });

  if (args.enqueueOnly) {
    const entry = await queue.appendEnvelope(envelope);
    process.stdout.write(`${JSON.stringify({ mode: "enqueue_only", queueEntry: entry }, null, 2)}\n`);
    return;
  }

  const result = await dispatchUnifiedEnvelope(runtime, envelope);
  if (result.response.failureClass !== "none" && result.primaryState.status === "failed") {
    await queue.appendEnvelope(envelope);
  }
  await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisFile = fileURLToPath(import.meta.url);
if (entryPath && entryPath === thisFile) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
