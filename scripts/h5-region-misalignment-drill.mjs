#!/usr/bin/env node
/**
 * H5 (h5-action-6): operator drill — dispatch with envelope region != router home region
 * must produce deterministic primary/fallback swap and regionAligned=false.
 * Writes evidence/h5-region-misalignment-drill-*.json; exits non-zero on invariant failure.
 */
import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
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

async function main() {
  const { evidenceDir } = parseArgs(process.argv.slice(2));
  const outDir = evidenceDir || path.join(ROOT, "evidence");
  await mkdir(outDir, { recursive: true });

  const { cmd, args: dispatchArgs } = await resolveDispatchCommand();

  const env = {
    ...process.env,
    UNIFIED_PREFLIGHT_ENABLED: "0",
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

  const { stdout, stderr } = await execFileP(
    cmd,
    [
      ...dispatchArgs,
      "--text",
      "h5 region misalignment drill",
      "--chat-id",
      "42",
      "--message-id",
      "1",
      "--region-id",
      "eu-west-1",
    ],
    { env, cwd: ROOT, maxBuffer: 4 * 1024 * 1024 },
  );
  const trimmed = stdout.trim();
  let result;
  try {
    result = JSON.parse(trimmed);
  } catch {
    throw new Error(`dispatch stdout was not JSON: ${stderr.slice(0, 500)} ${trimmed.slice(0, 200)}`);
  }

  const routing = result.routing ?? {};
  const failures = [];
  if (routing.regionAligned !== false) {
    failures.push(`expected routing.regionAligned === false, got ${String(routing.regionAligned)}`);
  }
  if (routing.primaryLane !== "hermes") {
    failures.push(`expected primaryLane hermes after region swap, got ${String(routing.primaryLane)}`);
  }
  if (routing.fallbackLane !== "eve") {
    failures.push(`expected fallbackLane eve after region swap, got ${String(routing.fallbackLane)}`);
  }
  if (!String(routing.reason ?? "").includes("region_failover_swap")) {
    failures.push(`expected routing.reason to include region_failover_swap, got ${String(routing.reason)}`);
  }
  if (routing.dispatchRegionId !== "eu-west-1") {
    failures.push(`expected dispatchRegionId eu-west-1, got ${String(routing.dispatchRegionId)}`);
  }
  if (routing.routerRegionId !== "us-east-1") {
    failures.push(`expected routerRegionId us-east-1, got ${String(routing.routerRegionId)}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const manifestPath = path.join(outDir, `h5-region-misalignment-drill-${stamp}.json`);
  const manifest = {
    schemaVersion: "h5-region-misalignment-drill-v1",
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    failures,
    drill: {
      envelopeRegionId: "eu-west-1",
      routerRegionId: "us-east-1",
      expectedPrimaryLane: "hermes",
      expectedFallbackLane: "eve",
    },
    dispatchSample: {
      traceId: result.envelope?.traceId,
      routing,
    },
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath })}\n`);

  if (failures.length > 0) {
    process.stderr.write(`h5-region-misalignment-drill failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
