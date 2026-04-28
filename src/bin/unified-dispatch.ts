#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EveAdapter } from "../adapters/eve-adapter.js";
import { HermesAdapter } from "../adapters/hermes-adapter.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import type { UnifiedMessageEnvelope } from "../contracts/types.js";
import { createUnifiedMemoryStoreFromEnv } from "../memory/unified-memory-store.js";
import { createDefaultUnifiedCapabilityRegistry } from "../skills/capability-registry.js";
import { UnifiedCapabilityEngine } from "../runtime/capability-engine.js";
import { registerDefaultCapabilityExecutors } from "../runtime/default-capability-handlers.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { createCapabilityPolicy } from "../runtime/capability-policy.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import { capabilityPolicyFingerprintSha256 } from "../config/capability-policy-fingerprint.js";
import {
  appendCapabilityPolicyDenialAudit,
  maybeAppendCapabilityPolicyConfigLoadedAudit,
} from "../runtime/capability-policy-audit.js";

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
      tenantId = argv[i + 1]?.trim() || undefined;
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
    envelope: UnifiedMessageEnvelope;
    signal?: AbortSignal;
  }) => {
    const adapter = input.lane === "eve" ? eveAdapter : hermesAdapter;
    return adapter.dispatch({
      envelope: {
        ...input.envelope,
        text: input.text,
      },
      intentRoute: input.intentRoute,
      signal: input.signal,
    });
  };
  registerDefaultCapabilityExecutors(capabilityRegistry, {
    dispatchLane,
    memoryStore: sharedMemoryStore,
  });
  const capabilityPolicy = createCapabilityPolicy(config.capabilityPolicy);
  const policyFingerprintSha256 = capabilityPolicyFingerprintSha256(config.capabilityPolicy);
  const policyAuditPath = config.capabilityPolicyAuditLogPath.trim();
  const policyAuditRotation =
    policyAuditPath.length > 0
      ? {
          maxBytesBeforeRotate: config.capabilityPolicyAuditRotationMaxBytes,
          retainBytesAfterRotate: config.capabilityPolicyAuditRotationRetainBytes,
        }
      : undefined;
  const capabilityEngine = new UnifiedCapabilityEngine(capabilityRegistry, {
    memoryStore: sharedMemoryStore,
    dispatchLane,
    policy: capabilityPolicy,
    policyFingerprintSha256,
    executionTimeoutMs: config.capabilityExecutionTimeoutMs,
    abortLaneOnCapabilityTimeout: config.capabilityAbortLaneOnTimeout,
    capabilityMaxOutputChars: config.capabilityMaxOutputChars,
    capabilityMaxLaneDispatches: config.capabilityMaxLaneDispatches,
    ...(policyAuditPath.length > 0
      ? {
          onPolicyDenial: async (payload) => {
            await appendCapabilityPolicyDenialAudit(
              policyAuditPath,
              {
                traceId: payload.traceId,
                chatId: payload.chatId,
                messageId: payload.messageId,
                capabilityId: payload.capabilityId,
                lane: payload.lane,
                policyReason: payload.policyReason,
                policyFingerprintSha256: payload.policyFingerprintSha256,
                envelope: payload.envelope,
              },
              policyAuditRotation,
            );
          },
        }
      : {}),
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
    auditEnabled: true,
    auditLogPath: config.unifiedDispatchAuditLogPath,
    capabilityPolicyAuditLogPath: policyAuditPath.length > 0 ? policyAuditPath : undefined,
    routerTelemetryLogPath:
      config.routerTelemetryLogPath.trim().length > 0 ? config.routerTelemetryLogPath.trim() : undefined,
    dispatchQueueJournalPath:
      config.dispatchQueueJournalPath.trim().length > 0
        ? config.dispatchQueueJournalPath.trim()
        : undefined,
  });
  if (preflightIssues.length > 0) {
    const reasons = preflightIssues.join("; ");
    throw new Error(`Runtime preflight failed: ${reasons}`);
  }
  if (policyAuditPath.length > 0 && config.capabilityPolicyAuditVerifyLoad) {
    await maybeAppendCapabilityPolicyConfigLoadedAudit(
      policyAuditPath,
      policyFingerprintSha256,
      policyAuditRotation,
    );
  }

  const runtime = {
    eveAdapter,
    hermesAdapter,
    routerConfig: config.routerConfig,
    capabilityEngine,
    memoryStore: sharedMemoryStore,
    tenantStrict: config.tenantStrict,
    tenantAllowlist: config.tenantAllowlist,
    tenantMemoryIsolation: config.tenantMemoryIsolation,
    ...(config.routerTelemetryLogPath.trim().length > 0
      ? {
          routerTelemetryLogPath: config.routerTelemetryLogPath.trim(),
          routerTelemetryRotationMaxBytes: config.routerTelemetryRotationMaxBytes,
          routerTelemetryRotationRetainBytes: config.routerTelemetryRotationRetainBytes,
        }
      : {}),
    ...(config.dispatchQueueJournalPath.trim().length > 0
      ? {
          dispatchQueueJournalPath: config.dispatchQueueJournalPath.trim(),
          dispatchQueueJournalRotationMaxBytes: config.dispatchQueueJournalRotationMaxBytes,
          dispatchQueueJournalRotationRetainBytes: config.dispatchQueueJournalRotationRetainBytes,
        }
      : {}),
  };

  const result = await dispatchUnifiedMessage(runtime, {
    channel: "telegram",
    chatId,
    messageId,
    text,
    ...(tenantId ? { tenantId } : {}),
  });
  await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result, {
    maxBytesBeforeRotate: config.auditLogRotationMaxBytes,
    retainBytesAfterRotate: config.auditLogRotationRetainBytes,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
