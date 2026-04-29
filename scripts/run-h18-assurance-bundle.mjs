#!/usr/bin/env node
/**
 * Horizon H18 assurance bundle: progressive cutover rehearsal — dry-run H2 drill suite
 * (canary hold + majority hold + rollback simulation) after merge-bundle evidence exists.
 *
 * Prerequisites: same as **run:h17-assurance-bundle** (release-readiness + initial-scope + H17 merge gates).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H18_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H18_ASSURANCE_OUT ?? path.join(evidenceDir, `h18-assurance-bundle-${stamp}.json`);

function newestH2DrillSuitePath(dir) {
  try {
    const names = readdirSync(dir);
    const hits = names
      .filter((n) => n.startsWith("h2-drill-suite-") && n.endsWith(".json"))
      .sort();
    if (!hits.length) {
      return "";
    }
    return path.join(dir, hits[hits.length - 1]);
  } catch {
    return "";
  }
}

function readJsonPass(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    const payload = JSON.parse(raw);
    return payload?.pass === true;
  } catch {
    return false;
  }
}

function runDrillSuite() {
  const r = spawnSync(
    "npm",
    [
      "run",
      "run:h2-drill-suite",
      "--",
      "--evidence-dir",
      evidenceDir,
      "--horizon-status-file",
      path.join(root, "docs/HORIZON_STATUS.json"),
      "--dry-run",
      "--allow-horizon-mismatch",
      "--canary-chats",
      "100,200",
      "--majority-percent",
      "90",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      shell: true,
    },
  );
  return {
    exitCode: r.status ?? 1,
    stderr: (r.stderr ?? "").slice(0, 4000),
    stdout: (r.stdout ?? "").slice(0, 4000),
  };
}

const drill = runDrillSuite();
const suiteReportPath = newestH2DrillSuitePath(evidenceDir);
const suiteReportPass = suiteReportPath ? readJsonPass(suiteReportPath) : false;
const drillSuitePass = drill.exitCode === 0 && suiteReportPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H18",
  pass: drillSuitePass,
  checks: {
    h2DrillSuitePass: drillSuitePass,
    h2DrillSuiteExitCode: drill.exitCode,
    h2DrillSuiteReportPass: suiteReportPass,
  },
  files: {
    h2DrillSuitePath: suiteReportPath || null,
  },
  steps: [
    {
      id: "run_h2_drill_suite_dry_run",
      exitCode: drill.exitCode,
      pass: drillSuitePass,
      stderr: drill.stderr,
      stdout: drill.stdout,
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
