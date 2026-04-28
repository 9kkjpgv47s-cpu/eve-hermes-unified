#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { buildUnifiedDispatchRuntime, resolveRepoRootFromImportMeta } from "../runtime/build-unified-dispatch-runtime.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import { appendDispatchWalLine, type DispatchWalAttemptRecord, type DispatchWalCompleteRecord } from "../runtime/dispatch-durable-wal.js";
import type { UnifiedDispatchResult } from "../contracts/types.js";

function parseArgs(argv: string[]): {
  text: string;
  chatId: string;
  messageId: string;
  tenantId?: string;
  regionId?: string;
  partitionId?: string;
} {
  let text = "";
  let chatId = "0";
  let messageId = "0";
  let tenantId: string | undefined;
  let regionId: string | undefined;
  let partitionId: string | undefined;
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
    } else if (arg === "--region-id") {
      regionId = argv[i + 1]?.trim() || undefined;
      i += 1;
    } else if (arg === "--partition-id") {
      partitionId = argv[i + 1]?.trim() || undefined;
      i += 1;
    }
  }
  if (!text.trim()) {
    throw new Error("Missing required --text argument.");
  }
  return { text, chatId, messageId, tenantId, regionId, partitionId };
}

async function main() {
  const rootDir = resolveRepoRootFromImportMeta(import.meta.url);
  await loadDotEnvFile(rootDir);
  const { text, chatId, messageId, tenantId: tenantArg, regionId: regionArg, partitionId: partitionArg } = parseArgs(
    process.argv.slice(2),
  );
  const config = loadUnifiedRuntimeEnvConfig();
  const { runtime } = buildUnifiedDispatchRuntime(config);

  const effectiveTenant =
    tenantArg?.trim() ||
    config.dispatchDefaultTenantId?.trim() ||
    "";
  const effectiveRegion = regionArg?.trim() || config.dispatchDefaultRegionId?.trim() || "";
  const effectivePartition =
    partitionArg?.trim() || config.dispatchDefaultPartitionId?.trim() || "";

  const preflightIssues = await runRuntimePreflight({
    enabled: config.preflight.enabled,
    strict: config.preflight.strict,
    eveDispatchScript: config.eveDispatchScript,
    eveDispatchResultPath: config.eveDispatchResultPath,
    hermesLaunchCommand: config.hermesLaunchCommand,
    unifiedMemoryStoreKind: config.unifiedMemoryStoreKind,
    unifiedMemoryFilePath: config.unifiedMemoryFilePath,
    unifiedMemoryDualWriteFilePath: config.unifiedMemoryDualWriteFilePath,
    dispatchDurableWalPath: config.dispatchDurableWalPath,
    auditEnabled: true,
    auditLogPath: config.unifiedDispatchAuditLogPath,
    tenantIsolationStrict: config.tenantIsolationStrict,
    dispatchTenantId: effectiveTenant,
  });
  if (preflightIssues.length > 0) {
    throw new Error(`Runtime preflight failed: ${preflightIssues.join("; ")}`);
  }

  const walPath = config.dispatchDurableWalPath?.trim();
  const attemptId = randomUUID();
  if (walPath) {
    const attempt: DispatchWalAttemptRecord = {
      walVersion: "v1",
      event: "dispatch_attempt",
      attemptId,
      recordedAtIso: new Date().toISOString(),
      channel: "telegram",
      chatId,
      messageId,
      text,
      ...(effectiveTenant ? { tenantId: effectiveTenant } : {}),
      ...(effectiveRegion ? { regionId: effectiveRegion } : {}),
      ...(effectivePartition ? { partitionId: effectivePartition } : {}),
    };
    await appendDispatchWalLine(walPath, attempt);
  }

  let result: UnifiedDispatchResult | undefined;
  try {
    result = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId,
      messageId,
      text,
      ...(tenantArg?.trim() ? { tenantId: tenantArg.trim() } : {}),
      ...(regionArg?.trim() ? { regionId: regionArg.trim() } : {}),
      ...(partitionArg?.trim() ? { partitionId: partitionArg.trim() } : {}),
    });
  } finally {
    if (walPath) {
      const complete: DispatchWalCompleteRecord = {
        walVersion: "v1",
        event: "dispatch_complete",
        attemptId,
        recordedAtIso: new Date().toISOString(),
        traceId: result?.envelope.traceId ?? "",
        primaryStatus: result?.primaryState?.status === "pass" ? "pass" : "failed",
        responseFailureClass: result?.response?.failureClass ?? "dispatch_failure",
        laneUsed: result?.response?.laneUsed ?? "eve",
        ...(result?.envelope.tenantId?.trim() ? { tenantId: result.envelope.tenantId.trim() } : {}),
        ...(result?.envelope.regionId?.trim() ? { regionId: result.envelope.regionId.trim() } : {}),
        ...(result?.envelope.partitionId?.trim() ? { partitionId: result.envelope.partitionId.trim() } : {}),
        ...(result?.routing.dispatchRegionId ? { envelopeRegionId: result.routing.dispatchRegionId } : {}),
        ...(result?.routing.routerRegionId ? { routerRegionId: result.routing.routerRegionId } : {}),
        ...(result?.routing.regionAligned !== undefined ? { regionAligned: result.routing.regionAligned } : {}),
      };
      await appendDispatchWalLine(walPath, complete);
    }
  }

  await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result!, {
    tenantPartition: config.dispatchAuditTenantPartition,
    maxBytesBeforeRotate: config.dispatchAuditMaxBytesBeforeRotate,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
