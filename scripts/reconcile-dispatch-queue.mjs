#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const options = { file: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--file") {
      options.file = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!isNonEmptyString(options.file)) {
    throw new Error("Missing --file <dispatch-queue-journal.jsonl>");
  }
  const resolved = path.resolve(options.file);
  const raw = await readFile(resolved, "utf8");
  const acceptedByTrace = new Map();
  const finishedTraces = new Set();
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  let parseErrors = 0;
  for (let i = 0; i < lines.length; i += 1) {
    let row;
    try {
      row = JSON.parse(lines[i]);
    } catch {
      parseErrors += 1;
      continue;
    }
    if (!row || typeof row !== "object") {
      parseErrors += 1;
      continue;
    }
    const traceId = typeof row.traceId === "string" ? row.traceId.trim() : "";
    if (!traceId) {
      parseErrors += 1;
      continue;
    }
    if (row.eventType === "dispatch_queue_accepted") {
      acceptedByTrace.set(traceId, { lineIndex: i + 1, row });
    } else if (row.eventType === "dispatch_queue_finished") {
      finishedTraces.add(traceId);
    }
  }

  const orphanAccepted = [];
  for (const [traceId, meta] of acceptedByTrace.entries()) {
    if (!finishedTraces.has(traceId)) {
      orphanAccepted.push({
        traceId,
        lineIndex: meta.lineIndex,
        dispatchPath: meta.row.dispatchPath ?? null,
        chatId: meta.row.chatId ?? null,
        messageId: meta.row.messageId ?? null,
      });
    }
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: orphanAccepted.length === 0 && parseErrors === 0,
    files: { journalPath: resolved },
    checks: {
      lineCount: lines.length,
      acceptedDistinctCount: acceptedByTrace.size,
      finishedDistinctCount: finishedTraces.size,
      orphanAcceptedCount: orphanAccepted.length,
      parseErrors,
    },
    orphanAccepted,
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(
      `Dispatch queue reconcile failed: orphanAccepted=${String(orphanAccepted.length)} parseErrors=${String(parseErrors)}\n`,
    );
    process.exitCode = 2;
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 2;
  });
}
