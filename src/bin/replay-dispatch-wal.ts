#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import {
  appendDispatchWalLine,
  findOrphanDispatchAttempts,
  type DispatchWalReplayCompleteRecord,
} from "../runtime/dispatch-durable-wal.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import { buildUnifiedDispatchRuntime, resolveRepoRootFromImportMeta } from "../runtime/build-unified-dispatch-runtime.js";

function parseArgs(argv: string[]): {
  dryRun: boolean;
  limit: number;
  walPath: string | undefined;
  outPath: string | undefined;
} {
  let dryRun = false;
  let limit = 50;
  let walPath: string | undefined;
  let outPath: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--limit") {
      limit = Math.max(1, Number.parseInt(argv[i + 1] ?? "50", 10) || 50);
      i += 1;
    } else if (arg === "--wal") {
      walPath = argv[i + 1];
      i += 1;
    } else if (arg === "--out") {
      outPath = argv[i + 1];
      i += 1;
    }
  }
  return { dryRun, limit, walPath, outPath };
}

async function main() {
  const rootDir = resolveRepoRootFromImportMeta(import.meta.url);
  await loadDotEnvFile(rootDir);
  const { dryRun, limit, walPath: walArg, outPath } = parseArgs(process.argv.slice(2));
  const config = loadUnifiedRuntimeEnvConfig();
  const walPath = walArg?.trim() || config.dispatchDurableWalPath?.trim();
  if (!walPath) {
    throw new Error("Missing WAL path: set UNIFIED_DISPATCH_DURABLE_WAL_PATH or pass --wal <path>.");
  }

  const preflightIssues = await runRuntimePreflight({
    enabled: config.preflight.enabled,
    strict: config.preflight.strict,
    eveDispatchScript: config.eveDispatchScript,
    eveDispatchResultPath: config.eveDispatchResultPath,
    hermesLaunchCommand: config.hermesLaunchCommand,
    unifiedMemoryStoreKind: config.unifiedMemoryStoreKind,
    unifiedMemoryFilePath: config.unifiedMemoryFilePath,
    unifiedMemoryDualWriteFilePath: config.unifiedMemoryDualWriteFilePath,
    dispatchDurableWalPath: walPath,
    auditEnabled: true,
    auditLogPath: config.unifiedDispatchAuditLogPath,
  });
  if (preflightIssues.length > 0) {
    throw new Error(`Runtime preflight failed: ${preflightIssues.join("; ")}`);
  }

  const orphans = (await findOrphanDispatchAttempts(walPath)).slice(0, limit);
  const { runtime } = buildUnifiedDispatchRuntime(config);

  const replayed: Array<{
    originalAttemptId: string;
    replayAttemptId: string;
    traceId: string;
    dryRun: boolean;
  }> = [];

  for (const o of orphans) {
    const replayAttemptId = `replay-${randomUUID()}`;
    if (dryRun) {
      replayed.push({
        originalAttemptId: o.attemptId,
        replayAttemptId,
        traceId: "(dry-run)",
        dryRun: true,
      });
      continue;
    }
    const result = await dispatchUnifiedMessage(runtime, {
      channel: o.channel,
      chatId: o.chatId,
      messageId: o.messageId,
      text: o.text,
    });
    await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result);
    const complete: DispatchWalReplayCompleteRecord = {
      walVersion: "v1",
      event: "dispatch_replay_complete",
      attemptId: replayAttemptId,
      originalAttemptId: o.attemptId,
      recordedAtIso: new Date().toISOString(),
      traceId: result.envelope.traceId,
      primaryStatus: result.primaryState.status,
      responseFailureClass: result.response.failureClass,
      laneUsed: result.response.laneUsed,
    };
    await appendDispatchWalLine(walPath, complete);
    replayed.push({
      originalAttemptId: o.attemptId,
      replayAttemptId,
      traceId: result.envelope.traceId,
      dryRun: false,
    });
  }

  const summary = {
    generatedAtIso: new Date().toISOString(),
    walPath,
    dryRun,
    limit,
    orphanCount: orphans.length,
    replayed,
  };
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  process.stdout.write(json);
  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, json, "utf8");
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
