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
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { createCapabilityPolicy } from "../runtime/capability-policy.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import { appendCapabilityPolicyDenialAudit, appendCapabilityPolicySnapshotIfChanged } from "../runtime/capability-policy-audit.js";
import { stableCapabilityPolicyJson } from "../config/capability-policy-fingerprint.js";

function parseArgs(argv: string[]): {
  text: string;
  chatId: string;
  messageId: string;
  tenantId?: string;
} {
  let text = "";
  let chatId = "0";
  let messageId = "0";
  let tenantId: string | undefined;
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
      tenantId = argv[i + 1]?.trim();
      i += 1;
    }
  }
  if (!text.trim()) {
    throw new Error("Missing required --text argument.");
  }
  return { text, chatId, messageId, tenantId };
}

async function main() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  await loadDotEnvFile(rootDir);
  const { text, chatId, messageId, tenantId } = parseArgs(process.argv.slice(2));
  const config = loadUnifiedRuntimeEnvConfig();
  const journalPath =
    config.unifiedMemoryStoreKind === "file" && config.unifiedMemoryJournalPath.trim().length > 0
      ? config.unifiedMemoryJournalPath
      : undefined;
  const sharedMemoryStore = createUnifiedMemoryStoreFromEnv(
    config.unifiedMemoryStoreKind,
    config.unifiedMemoryFilePath,
    journalPath,
    config.unifiedMemoryStoreKind === "file"
      ? {
          verifyPersist: config.unifiedMemoryVerifyPersist,
          verifyJournalReplay: config.unifiedMemoryVerifyJournalReplay,
        }
      : undefined,
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
    signal?: AbortSignal;
  }) => {
    const adapter = input.lane === "eve" ? eveAdapter : hermesAdapter;
    const baseEnvelope = {
      channel: "telegram" as const,
      chatId: input.chatId,
      messageId: input.messageId,
      text: input.text,
      traceId: input.traceId,
      receivedAtIso: new Date().toISOString(),
    };
    const envelope = input.tenantId
      ? { ...baseEnvelope, tenantId: input.tenantId }
      : baseEnvelope;
    return adapter.dispatch({
      envelope,
      intentRoute: input.intentRoute,
      signal: input.signal,
    });
  };
  registerDefaultCapabilityExecutors(capabilityRegistry, {
    dispatchLane,
    memoryStore: sharedMemoryStore,
  });
  const capabilityPolicy = createCapabilityPolicy(config.capabilityPolicy);
  const policyAuditPath = config.capabilityPolicyAuditPath.trim();
  if (policyAuditPath.length > 0) {
    await appendCapabilityPolicySnapshotIfChanged(
      policyAuditPath,
      stableCapabilityPolicyJson(config.capabilityPolicy),
    );
  }
  const capabilityEngine = new UnifiedCapabilityEngine(capabilityRegistry, {
    memoryStore: sharedMemoryStore,
    dispatchLane,
    policy: capabilityPolicy,
    executionTimeoutMs: config.capabilityExecutionTimeoutMs,
    abortLaneOnCapabilityTimeout: config.capabilityAbortLaneOnTimeout,
    onPolicyDenial:
      policyAuditPath.length > 0
        ? async (payload) => {
            await appendCapabilityPolicyDenialAudit(policyAuditPath, payload);
          }
        : undefined,
  });

  const preflightIssues = await runRuntimePreflight({
    enabled: config.preflight.enabled,
    strict: config.preflight.strict,
    eveDispatchScript: config.eveDispatchScript,
    eveDispatchResultPath: config.eveDispatchResultPath,
    hermesLaunchCommand: config.hermesLaunchCommand,
    unifiedMemoryStoreKind: config.unifiedMemoryStoreKind,
    unifiedMemoryFilePath: config.unifiedMemoryFilePath,
    unifiedMemoryJournalPath: journalPath,
    capabilityPolicyAuditPath: policyAuditPath.length > 0 ? policyAuditPath : undefined,
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
    tenantStrict: config.tenantStrict,
    tenantAllowlist: config.tenantAllowlist,
  };

  const result = await dispatchUnifiedMessage(runtime, {
    channel: "telegram",
    chatId,
    messageId,
    text,
    ...(tenantId && tenantId.length > 0 ? { tenantId } : {}),
  });
  await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result, {
    maxBytesBeforeRotate: config.auditLogRotationMaxBytes,
    retainBytesAfterRotate: config.auditLogRotationRetainBytes,
    rotateRetainBackupCount: config.auditLogRotateRetainBackupCount,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
