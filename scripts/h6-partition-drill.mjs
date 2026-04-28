#!/usr/bin/env node
/**
 * H6: partition-scoped dispatch drill — verifies envelope.partitionId and WAL
 * attempt/complete carry matching partitionId (h6-action-3).
 */
import { execFile } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function fileExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveDispatchCommand() {
  const dispatchJs = path.join(ROOT, "dist/src/bin/unified-dispatch.js");
  if (await fileExists(dispatchJs)) {
    return { cmd: process.execPath, args: [dispatchJs] };
  }
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const dispatchTs = path.join(ROOT, "src/bin/unified-dispatch.ts");
  if (await fileExists(tsx) && (await fileExists(dispatchTs))) {
    return { cmd: tsx, args: [dispatchTs] };
  }
  throw new Error(
    "Missing dispatch runner: run npm run build or ensure node_modules/.bin/tsx and src/bin/unified-dispatch.ts exist.",
  );
}

function parseArgs(argv) {
  const opts = { evidenceDir: "" };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--evidence-dir" && argv[i + 1]) {
      opts.evidenceDir = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

function baseEnv(outDir, walPath) {
  return {
    ...process.env,
    UNIFIED_PREFLIGHT_ENABLED: "0",
    UNIFIED_DISPATCH_DURABLE_WAL_PATH: walPath,
    UNIFIED_DISPATCH_DEFAULT_PARTITION_ID: "",
    DISPATCH_DEFAULT_PARTITION_ID: "",
    UNIFIED_EVE_TASK_DISPATCH_SCRIPT: process.env.UNIFIED_SOAK_EVE_DISPATCH_SCRIPT || "/bin/true",
    EVE_TASK_DISPATCH_SCRIPT: process.env.UNIFIED_SOAK_EVE_DISPATCH_SCRIPT || "/bin/true",
    UNIFIED_EVE_DISPATCH_RESULT_PATH:
      process.env.UNIFIED_SOAK_EVE_DISPATCH_RESULT_PATH || path.join(outDir, "h6-partition-drill-eve.json"),
    EVE_DISPATCH_RESULT_PATH:
      process.env.UNIFIED_SOAK_EVE_DISPATCH_RESULT_PATH || path.join(outDir, "h6-partition-drill-eve.json"),
    UNIFIED_HERMES_LAUNCH_COMMAND: process.env.UNIFIED_SOAK_HERMES_LAUNCH_COMMAND || "/bin/true",
    HERMES_LAUNCH_COMMAND: process.env.UNIFIED_SOAK_HERMES_LAUNCH_COMMAND || "/bin/true",
    UNIFIED_HERMES_LAUNCH_ARGS: "",
    HERMES_LAUNCH_ARGS: "",
    UNIFIED_ROUTER_DEFAULT_PRIMARY: "eve",
    UNIFIED_ROUTER_DEFAULT_FALLBACK: "hermes",
    UNIFIED_ROUTER_FAIL_CLOSED: "0",
    UNIFIED_ROUTER_CUTOVER_STAGE: "shadow",
    ROUTER_CUTOVER_STAGE: "shadow",
    UNIFIED_ROUTER_STAGE: "shadow",
  };
}

async function runDispatch(cmd, dispatchArgs, env, chatId, messageId, text, partitionId) {
  const args = [
    ...dispatchArgs,
    "--text",
    text,
    "--chat-id",
    chatId,
    "--message-id",
    messageId,
    "--partition-id",
    partitionId,
  ];
  const { stdout, stderr } = await execFileP(cmd, args, { env, cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`dispatch stdout was not JSON: ${stderr.slice(0, 400)} ${trimmed.slice(0, 200)}`);
  }
}

/**
 * WAL: attemptId -> attempt; validate partitionId on attempt/complete for partition drill lines.
 */
async function validateWalPartitionPropagation(walPath, expectedPartitions) {
  const failures = [];
  let raw = "";
  try {
    raw = await readFile(walPath, "utf8");
  } catch (e) {
    return [`WAL read failed: ${String(e?.message ?? e)}`];
  }
  const attempts = new Map();
  const completes = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("{")) {
      continue;
    }
    let rec;
    try {
      rec = JSON.parse(t);
    } catch {
      continue;
    }
    if (rec.event === "dispatch_attempt" && rec.attemptId) {
      attempts.set(rec.attemptId, rec);
    }
    if (rec.event === "dispatch_complete" && rec.attemptId) {
      completes.push(rec);
    }
  }
  if (completes.length < expectedPartitions.length) {
    failures.push(
      `expected at least ${expectedPartitions.length} dispatch_complete lines in WAL, found ${completes.length}`,
    );
  }
  for (const c of completes) {
    const att = attempts.get(c.attemptId);
    if (!att) {
      failures.push(`dispatch_complete attemptId ${c.attemptId} has no matching dispatch_attempt`);
      continue;
    }
    const want = String(c.partitionId ?? "").trim();
    const attPart = String(att.partitionId ?? "").trim();
    if (!want) {
      failures.push(`dispatch_complete ${c.attemptId} missing partitionId`);
      continue;
    }
    if (attPart !== want) {
      failures.push(`attempt/complete partitionId mismatch for ${c.attemptId}: attempt=${attPart} complete=${want}`);
    }
    if (!expectedPartitions.includes(want)) {
      failures.push(`dispatch_complete ${c.attemptId} unexpected partitionId ${want}`);
    }
  }
  return failures;
}

async function main() {
  const { evidenceDir } = parseArgs(process.argv.slice(2));
  const outDir = evidenceDir || path.join(ROOT, "evidence");
  await mkdir(outDir, { recursive: true });

  const walPath = path.join(outDir, `h6-partition-drill-${Date.now()}.wal.jsonl`);
  const partitionA = "h6-drill-cell-alpha";
  const partitionB = "h6-drill-cell-beta";
  const expectedPartitions = [partitionA, partitionB];

  try {
    const { cmd, args: dispatchArgs } = await resolveDispatchCommand();
    const env = baseEnv(outDir, walPath);

    const scenarios = [
      {
        id: "partition_alpha",
        text: "h6 partition drill cell alpha",
        chatId: "9101",
        messageId: "1",
        partitionId: partitionA,
      },
      {
        id: "partition_beta",
        text: "h6 partition drill cell beta",
        chatId: "9102",
        messageId: "2",
        partitionId: partitionB,
      },
    ];

    const scenarioResults = [];
    const allFailures = [];

    for (const s of scenarios) {
      const result = await runDispatch(
        cmd,
        dispatchArgs,
        env,
        s.chatId,
        s.messageId,
        s.text,
        s.partitionId,
      );
      const envPart = result.envelope?.partitionId?.trim();
      if (envPart !== s.partitionId) {
        allFailures.push(
          `${s.id}: expected envelope.partitionId ${s.partitionId}, got ${String(envPart)}`,
        );
      }
      scenarioResults.push({
        id: s.id,
        text: s.text,
        traceId: result.envelope?.traceId,
        partitionId: envPart,
      });
    }

    allFailures.push(...(await validateWalPartitionPropagation(walPath, expectedPartitions)));

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const manifestPath = path.join(outDir, `h6-partition-drill-${stamp}.json`);
    const manifest = {
      schemaVersion: "h6-partition-drill-v1",
      generatedAtIso: new Date().toISOString(),
      pass: allFailures.length === 0,
      failures: allFailures,
      walPath,
      drill: {
        partitionIds: expectedPartitions,
        scenarios: scenarios.map((s) => ({ id: s.id, partitionId: s.partitionId })),
      },
      scenarioResults,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath })}\n`);

    if (allFailures.length > 0) {
      process.stderr.write(`h6-partition-drill failed:\n- ${allFailures.join("\n- ")}\n`);
      process.exitCode = 2;
    }
  } finally {
    try {
      await rm(walPath, { force: true });
    } catch {
      // ignore
    }
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
