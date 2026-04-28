#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { buildUnifiedDispatchRuntime, resolveRepoRootFromImportMeta } from "../runtime/build-unified-dispatch-runtime.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { runRuntimePreflight } from "../runtime/preflight.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import {
  appendDispatchWalLine,
  findOrphanDispatchAttempts,
  type DispatchWalReplayCompleteRecord,
} from "../runtime/dispatch-durable-wal.js";
import type { UnifiedDispatchResult } from "../contracts/types.js";

function parseArgs(argv: string[]): {
  dryRun: boolean;
  limit: number;
  walPath: string;
  outPath: string;
} {
  let dryRun = false;
  let limit = 50;
  let walPath = "";
  let outPath = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--limit") {
      limit = Math.max(1, Number(argv[i + 1] ?? "50") || 50);
      i += 1;
    } else if (arg === "--wal") {
      walPath = argv[i + 1]?.trim() ?? "";
      i += 1;
    } else if (arg === "--out") {
      outPath = argv[i + 1]?.trim() ?? "";
      i += 1;
    }
  }
  return { dryRun, limit, walPath, outPath };
}

async function main() {
  const rootDir = resolveRepoRootFromImportMeta(import.meta.url);
  await loadDotEnvFile(rootDir);
  const config = loadUnifiedRuntimeEnvConfig();
  const parsed = parseArgs(process.argv.slice(2));
  const walPath = parsed.walPath || config.dispatchDurableWalPath?.trim() || "";
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
    dispatchDurableWalPath: config.dispatchDurableWalPath,
    auditEnabled: false,
    auditLogPath: config.unifiedDispatchAuditLogPath,
  });
  if (preflightIssues.length > 0) {
    throw new Error(`Runtime preflight failed: ${preflightIssues.join("; ")}`);
  }

  const orphans = await findOrphanDispatchAttempts(walPath);
  const slice = orphans.slice(0, parsed.limit);
  const { runtime } = buildUnifiedDispatchRuntime(config);

  const replays: Array<{
    attemptId: string;
    dryRun: boolean;
    traceId?: string;
    primaryStatus?: string;
    responseFailureClass?: string;
    laneUsed?: string;
  }> = [];

  for (const o of slice) {
    if (parsed.dryRun) {
      replays.push({ attemptId: o.attemptId, dryRun: true });
      continue;
    }
    const result: UnifiedDispatchResult = await dispatchUnifiedMessage(runtime, {
      channel: "telegram",
      chatId: o.chatId,
      messageId: o.messageId,
      text: o.text,
    });
    await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result);
    const replayId = randomUUID();
    const replay: DispatchWalReplayCompleteRecord = {
      walVersion: "v1",
      event: "dispatch_replay_complete",
      attemptId: replayId,
      originalAttemptId: o.attemptId,
      recordedAtIso: new Date().toISOString(),
      traceId: result.envelope.traceId,
      primaryStatus: result.primaryState.status === "pass" ? "pass" : "failed",
      responseFailureClass: result.response.failureClass,
      laneUsed: result.response.laneUsed,
    };
    await appendDispatchWalLine(walPath, replay);
    replays.push({
      attemptId: o.attemptId,
      dryRun: false,
      traceId: result.envelope.traceId,
      primaryStatus: replay.primaryStatus,
      responseFailureClass: replay.responseFailureClass,
      laneUsed: replay.laneUsed,
    });
  }

  const summary = {
    generatedAtIso: new Date().toISOString(),
    walPath,
    orphanCount: orphans.length,
    replayed: slice.length,
    dryRun: parsed.dryRun,
    replays,
  };
  const out =
    parsed.outPath ||
    path.join(rootDir, "evidence", `dispatch-wal-replay-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
