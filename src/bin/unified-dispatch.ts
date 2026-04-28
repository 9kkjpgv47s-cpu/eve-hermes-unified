#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import type { UnifiedDispatchResult } from "../contracts/types.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import {
  appendDispatchWalLine,
  type DispatchWalAttemptRecord,
  type DispatchWalCompleteRecord,
} from "../runtime/dispatch-durable-wal.js";
import { buildUnifiedDispatchRuntime, resolveRepoRootFromImportMeta } from "../runtime/build-unified-dispatch-runtime.js";

function parseArgs(argv: string[]): { text: string; chatId: string; messageId: string } {
  let text = "";
  let chatId = "0";
  let messageId = "0";
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
    }
  }
  if (!text.trim()) {
    throw new Error("Missing required --text argument.");
  }
  return { text, chatId, messageId };
}

async function main() {
  const rootDir = resolveRepoRootFromImportMeta(import.meta.url);
  await loadDotEnvFile(rootDir);
  const { text, chatId, messageId } = parseArgs(process.argv.slice(2));
  const config = loadUnifiedRuntimeEnvConfig();
  const { runtime } = buildUnifiedDispatchRuntime(config);

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
  });
  if (preflightIssues.length > 0) {
    const reasons = preflightIssues.join("; ");
    throw new Error(`Runtime preflight failed: ${reasons}`);
  }

  const walPath = config.dispatchDurableWalPath?.trim();
  const attemptId = walPath ? randomUUID() : undefined;
  if (walPath && attemptId) {
    const attempt: DispatchWalAttemptRecord = {
      walVersion: "v1",
      event: "dispatch_attempt",
      attemptId,
      recordedAtIso: new Date().toISOString(),
      channel: "telegram",
      chatId,
      messageId,
      text,
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
    });
  } finally {
    if (walPath && attemptId) {
      const complete: DispatchWalCompleteRecord = {
        walVersion: "v1",
        event: "dispatch_complete",
        attemptId,
        recordedAtIso: new Date().toISOString(),
        traceId: result?.envelope.traceId ?? "",
        primaryStatus: result?.primaryState.status ?? "failed",
        responseFailureClass: result?.response.failureClass ?? "dispatch_failure",
        laneUsed: result?.response.laneUsed ?? "eve",
      };
      await appendDispatchWalLine(walPath, complete);
    }
  }

  await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result!);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
