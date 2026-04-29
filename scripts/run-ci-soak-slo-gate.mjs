#!/usr/bin/env node
/**
 * Runs soak-simulate.sh then summarize-soak-report.mjs with UNIFIED_SOAK_FAIL_ON_DRIFT=1.
 * Writes evidence/ci-soak-slo-gate-*.json for H13 closeout / assurance bundles.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.CI_SOAK_SLO_GATE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const iterationsRaw = process.env.UNIFIED_CI_SOAK_ITERATIONS ?? "25";
const iterations = Math.max(1, Number.parseInt(String(iterationsRaw), 10) || 25);

const soakEnv = {
  ...process.env,
  UNIFIED_EVIDENCE_DIR: evidenceDir,
};

const soakRun = spawnSync("bash", [path.join(root, "scripts/soak-simulate.sh"), String(iterations)], {
  cwd: root,
  encoding: "utf8",
  env: soakEnv,
});
const soakStdout = soakRun.stdout ?? "";
const soakStderr = soakRun.stderr ?? "";

let soakReportPath = "";
const soakFiles = readdirSync(evidenceDir)
  .filter((name) => name.startsWith("soak-") && name.endsWith(".jsonl"))
  .sort();
if (soakFiles.length > 0) {
  soakReportPath = path.join(evidenceDir, soakFiles[soakFiles.length - 1]);
}

const summarizeEnv = {
  ...process.env,
  UNIFIED_SOAK_FAIL_ON_DRIFT: "1",
};

let summaryPayload = null;
let summarizeExit = 2;
if (soakReportPath) {
  const sum = spawnSync(process.execPath, [path.join(root, "scripts/summarize-soak-report.mjs"), soakReportPath], {
    cwd: root,
    encoding: "utf8",
    env: summarizeEnv,
  });
  summarizeExit = sum.status ?? 1;
  const out = (sum.stdout ?? "").trim();
  try {
    summaryPayload = out ? JSON.parse(out) : null;
  } catch {
    summaryPayload = null;
  }
}

const driftAlarms = Array.isArray(summaryPayload?.driftAlarms) ? summaryPayload.driftAlarms : [];
const ciSoakDriftPass =
  Boolean(soakReportPath) && summarizeExit === 0 && driftAlarms.length === 0;

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.CI_SOAK_SLO_GATE_OUT ?? path.join(evidenceDir, `ci-soak-slo-gate-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "ci-soak-slo-gate",
  pass: ciSoakDriftPass,
  iterations,
  checks: {
    soakReportPresent: Boolean(soakReportPath),
    ciSoakDriftPass,
  },
  soakReportPath: soakReportPath || null,
  summarizeExitCode: soakReportPath ? summarizeExit : null,
  driftAlarms,
  summary: summaryPayload,
  soakSimulate: {
    exitCode: soakRun.status ?? 0,
    stderrTail: soakStderr.slice(-2000),
    stdoutTail: soakStdout.slice(-2000),
  },
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(ciSoakDriftPass ? 0 : 1);
