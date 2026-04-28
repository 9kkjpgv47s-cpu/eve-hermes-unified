#!/usr/bin/env node
/**
 * H5: region misalignment drill — default route, @cursor, and @hermes passthrough
 * with WAL attempt/complete correlation (h5-action-6 + h5-action-8).
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
    UNIFIED_EVE_TASK_DISPATCH_SCRIPT: process.env.UNIFIED_SOAK_EVE_DISPATCH_SCRIPT || "/bin/true",
    EVE_TASK_DISPATCH_SCRIPT: process.env.UNIFIED_SOAK_EVE_DISPATCH_SCRIPT || "/bin/true",
    UNIFIED_EVE_DISPATCH_RESULT_PATH:
      process.env.UNIFIED_SOAK_EVE_DISPATCH_RESULT_PATH || path.join(outDir, "h5-region-drill-eve.json"),
    EVE_DISPATCH_RESULT_PATH:
      process.env.UNIFIED_SOAK_EVE_DISPATCH_RESULT_PATH || path.join(outDir, "h5-region-drill-eve.json"),
    UNIFIED_HERMES_LAUNCH_COMMAND: process.env.UNIFIED_SOAK_HERMES_LAUNCH_COMMAND || "/bin/true",
    HERMES_LAUNCH_COMMAND: process.env.UNIFIED_SOAK_HERMES_LAUNCH_COMMAND || "/bin/true",
    UNIFIED_HERMES_LAUNCH_ARGS: "",
    HERMES_LAUNCH_ARGS: "",
    UNIFIED_ROUTER_REGION_ID: "us-east-1",
    UNIFIED_ROUTER_DEFAULT_PRIMARY: "eve",
    UNIFIED_ROUTER_DEFAULT_FALLBACK: "hermes",
    UNIFIED_ROUTER_FAIL_CLOSED: "0",
    UNIFIED_ROUTER_CUTOVER_STAGE: "",
    ROUTER_CUTOVER_STAGE: "",
    UNIFIED_ROUTER_STAGE: "",
  };
}

async function runDispatch(cmd, dispatchArgs, env, chatId, messageId, text, regionId, tenantId) {
  const args = [...dispatchArgs, "--text", text, "--chat-id", chatId, "--message-id", messageId, "--region-id", regionId];
  if (tenantId) {
    args.push("--tenant-id", tenantId);
  }
  const { stdout, stderr } = await execFileP(cmd, args, { env, cwd: ROOT, maxBuffer: 4 * 1024 * 1024 });
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`dispatch stdout was not JSON: ${stderr.slice(0, 400)} ${trimmed.slice(0, 200)}`);
  }
}

function assertRegionSwap(routing, label, expectedPrimary, expectedFallback) {
  const failures = [];
  if (routing.regionAligned !== false) {
    failures.push(`${label}: expected routing.regionAligned === false, got ${String(routing.regionAligned)}`);
  }
  if (routing.primaryLane !== expectedPrimary) {
    failures.push(
      `${label}: expected primaryLane ${expectedPrimary}, got ${String(routing.primaryLane)}`,
    );
  }
  if (routing.fallbackLane !== expectedFallback) {
    failures.push(
      `${label}: expected fallbackLane ${expectedFallback}, got ${String(routing.fallbackLane)}`,
    );
  }
  if (!String(routing.reason ?? "").includes("region_failover_swap")) {
    failures.push(
      `${label}: expected routing.reason to include region_failover_swap, got ${String(routing.reason)}`,
    );
  }
  if (routing.dispatchRegionId !== "eu-west-1") {
    failures.push(`${label}: expected dispatchRegionId eu-west-1, got ${String(routing.dispatchRegionId)}`);
  }
  if (routing.routerRegionId !== "us-east-1") {
    failures.push(`${label}: expected routerRegionId us-east-1, got ${String(routing.routerRegionId)}`);
  }
  return failures;
}

/**
 * Parse WAL: map attemptId -> attempt; complete lines add correlation checks.
 */
async function validateWalCorrelation(walPath) {
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
  if (completes.length < 3) {
    failures.push(`expected at least 3 dispatch_complete lines in WAL, found ${completes.length}`);
  }
  for (const c of completes) {
    const att = attempts.get(c.attemptId);
    if (!att) {
      failures.push(`dispatch_complete attemptId ${c.attemptId} has no matching dispatch_attempt`);
      continue;
    }
    if (!c.traceId || String(c.traceId).trim() === "") {
      failures.push(`dispatch_complete ${c.attemptId} missing traceId`);
    }
    if (c.tenantId !== undefined && att.tenantId !== undefined && c.tenantId !== att.tenantId) {
      failures.push(
        `attempt/complete tenantId mismatch for ${c.attemptId}: ${att.tenantId} vs ${c.tenantId}`,
      );
    }
    if (c.regionId !== undefined && att.regionId !== undefined && c.regionId !== att.regionId) {
      failures.push(
        `attempt/complete regionId mismatch for ${c.attemptId}: ${att.regionId} vs ${c.regionId}`,
      );
    }
    if (c.envelopeRegionId !== "eu-west-1") {
      failures.push(
        `dispatch_complete ${c.attemptId} expected envelopeRegionId eu-west-1, got ${String(c.envelopeRegionId)}`,
      );
    }
    if (c.routerRegionId !== "us-east-1") {
      failures.push(
        `dispatch_complete ${c.attemptId} expected routerRegionId us-east-1, got ${String(c.routerRegionId)}`,
      );
    }
    if (c.regionAligned !== false) {
      failures.push(
        `dispatch_complete ${c.attemptId} expected regionAligned false, got ${String(c.regionAligned)}`,
      );
    }
  }
  return failures;
}

async function main() {
  const { evidenceDir } = parseArgs(process.argv.slice(2));
  const outDir = evidenceDir || path.join(ROOT, "evidence");
  await mkdir(outDir, { recursive: true });

  const walPath = path.join(outDir, `h5-region-drill-${Date.now()}.wal.jsonl`);
  try {
    const { cmd, args: dispatchArgs } = await resolveDispatchCommand();
    const env = baseEnv(outDir, walPath);

    const scenarios = [
      {
        id: "default_route",
        text: "h5 region misalignment default route",
        chatId: "42",
        messageId: "1",
        expectedPrimary: "hermes",
        expectedFallback: "eve",
        tenantId: "",
        envOverride: {},
      },
      {
        id: "cursor_passthrough",
        text: "@cursor h5 region drill",
        chatId: "43",
        messageId: "2",
        expectedPrimary: "hermes",
        expectedFallback: "eve",
        tenantId: "drill-tenant-a",
        envOverride: {},
      },
      {
        id: "hermes_passthrough",
        text: "@hermes h5 region drill",
        chatId: "44",
        messageId: "3",
        expectedPrimary: "eve",
        expectedFallback: "hermes",
        tenantId: "drill-tenant-b",
        /** Need distinct primary/fallback for swap; default hermes+hermes would be no-op. */
        envOverride: {
          UNIFIED_ROUTER_DEFAULT_FALLBACK: "eve",
          ROUTER_DEFAULT_FALLBACK: "eve",
        },
      },
    ];

    const scenarioResults = [];
    const allFailures = [];

    for (const s of scenarios) {
      const scenarioEnv = { ...env, ...s.envOverride };
      const result = await runDispatch(
        cmd,
        dispatchArgs,
        scenarioEnv,
        s.chatId,
        s.messageId,
        s.text,
        "eu-west-1",
        s.tenantId || undefined,
      );
      const routing = result.routing ?? {};
      const f = assertRegionSwap(routing, s.id, s.expectedPrimary, s.expectedFallback);
      allFailures.push(...f);
      scenarioResults.push({
        id: s.id,
        text: s.text,
        traceId: result.envelope?.traceId,
        routing,
        tenantId: result.envelope?.tenantId,
        regionId: result.envelope?.regionId,
      });
    }

    const walFailures = await validateWalCorrelation(walPath);
    allFailures.push(...walFailures);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const manifestPath = path.join(outDir, `h5-region-misalignment-drill-${stamp}.json`);
    const manifest = {
      schemaVersion: "h5-region-misalignment-drill-v2",
      generatedAtIso: new Date().toISOString(),
      pass: allFailures.length === 0,
      failures: allFailures,
      walPath,
      drill: {
        envelopeRegionId: "eu-west-1",
        routerRegionId: "us-east-1",
        scenarios: scenarios.map((s) => ({
          id: s.id,
          expectedPrimaryLane: s.expectedPrimary,
          expectedFallbackLane: s.expectedFallback,
        })),
      },
      scenarioResults,
    };
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath })}\n`);

    if (allFailures.length > 0) {
      process.stderr.write(`h5-region-misalignment-drill failed:\n- ${allFailures.join("\n- ")}\n`);
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
