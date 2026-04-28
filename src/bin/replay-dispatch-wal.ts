#!/usr/bin/env node
/**
 * Replay orphan dispatch attempts from the durable WAL (H3).
 * Orphans are dispatch_attempt lines with no matching dispatch_complete for the same attemptId.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedRuntimeEnvConfig } from "../config/unified-runtime-config.js";
import { buildUnifiedDispatchRuntime, resolveRepoRootFromImportMeta } from "../runtime/build-unified-dispatch-runtime.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { appendDispatchAuditLog } from "../runtime/audit-log.js";
import { appendDispatchWalLine, findOrphanDispatchAttempts } from "../runtime/dispatch-durable-wal.js";
import { runRuntimePreflight } from "../runtime/preflight.js";

function parseArgs(argv: string[]) {
  const options = {
    dryRun: false,
    limit: 0,
    out: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--limit") {
      options.limit = Number(argv[i + 1] ?? "0");
      i += 1;
    } else if (arg === "--out") {
      options.out = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return options;
}

async function main() {
  const rootDir = resolveRepoRootFromImportMeta(import.meta.url);
  await loadDotEnvFile(rootDir);
  const config = loadUnifiedRuntimeEnvConfig();
  const walPath = String(config.dispatchDurableWalPath ?? "").trim();
  if (!walPath) {
    process.stderr.write(
      "UNIFIED_DISPATCH_DURABLE_WAL_PATH is not set; nothing to replay.\n",
    );
    process.exitCode = 2;
    return;
  }

  const options = parseArgs(process.argv.slice(2));
  const orphans = await findOrphanDispatchAttempts(walPath);
  const toReplay =
    options.limit > 0 ? orphans.slice(0, Math.min(options.limit, orphans.length)) : orphans;

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
    throw new Error(`Runtime preflight failed: ${preflightIssues.join("; ")}`);
  }

  const { runtime } = buildUnifiedDispatchRuntime(config);
  const replayed: Array<{
    attemptId: string;
    traceId: string;
    status: string;
    dryRun: boolean;
  }> = [];

  for (const orphan of toReplay) {
    if (options.dryRun) {
      replayed.push({
        attemptId: orphan.attemptId,
        traceId: "",
        status: "dry_run",
        dryRun: true,
      });
      continue;
    }
    const result = await dispatchUnifiedMessage(runtime, {
      channel: orphan.channel,
      chatId: orphan.chatId,
      messageId: orphan.messageId,
      text: orphan.text,
    });
    await appendDispatchAuditLog(config.unifiedDispatchAuditLogPath, result);
    await appendDispatchWalLine(walPath, {
      walVersion: "v1",
      event: "dispatch_replay_complete",
      originalAttemptId: orphan.attemptId,
      recordedAtIso: new Date().toISOString(),
      traceId: result.envelope.traceId,
      primaryStatus: result.primaryState.status,
      responseFailureClass: result.response.failureClass,
      laneUsed: result.response.laneUsed,
    });
    replayed.push({
      attemptId: orphan.attemptId,
      traceId: result.envelope.traceId,
      status: result.primaryState.status,
      dryRun: false,
    });
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: true,
    walPath,
    dryRun: options.dryRun,
    orphanCount: orphans.length,
    replayedCount: replayed.length,
    replayed,
  };
  const outPath = options.out.trim()
    ? path.resolve(options.out)
    : path.join(
        path.dirname(walPath),
        `dispatch-wal-replay-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}.json`,
      );
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
