#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:evidence-gates (H23 closeout).
 * Pairs newest **`validation-summary-*.json`** with **`failure-injection-*.txt`**, runs **`evidence-gates.mjs`**, writes **`evidence/evidence-gates-evidence-*.json`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.EVIDENCE_GATES_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function newestMatching(prefix, suffix) {
  const names = readdirSync(evidenceDir)
    .filter((n) => n.startsWith(prefix) && n.endsWith(suffix))
    .sort();
  return names.length ? path.join(evidenceDir, names[names.length - 1]) : "";
}

const summaryPath = newestMatching("validation-summary-", ".json");
const failurePath = newestMatching("failure-injection-", ".txt");

if (!summaryPath || !failurePath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = path.join(evidenceDir, `evidence-gates-evidence-${stamp}.json`);
  const failPayload = {
    generatedAtIso: new Date().toISOString(),
    kind: "evidence-gates-evidence",
    pass: false,
    summaryPath: summaryPath || null,
    failureReportPath: failurePath || null,
    checks: {
      evidenceGatesInputsPresent: false,
      evidenceGatesCliPass: false,
    },
    steps: [{ id: "missing_inputs", exitCode: 2, pass: false, stderr: "missing validation-summary or failure-injection", stdout: "" }],
  };
  writeFileSync(outPath, `${JSON.stringify(failPayload, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
  process.exit(1);
}

const maxP95 = process.env.EVIDENCE_GATES_MAX_P95_MS ?? "2500";
const scan = spawnSync(
  process.execPath,
  [
    path.join(root, "scripts/evidence-gates.mjs"),
    "--summary",
    summaryPath,
    "--failure-report",
    failurePath,
    "--require-failure-scenarios",
    "1",
    "--max-p95-ms",
    maxP95,
  ],
  { cwd: root, encoding: "utf8", env: process.env },
);

const exitCode = scan.status ?? 1;
const cliPass = exitCode === 0;

let gatePayloadPass = false;
try {
  const parsed = JSON.parse(String(scan.stdout ?? "").trim().split("\n").filter(Boolean).pop() ?? "{}");
  gatePayloadPass = parsed?.pass === true;
} catch {
  gatePayloadPass = false;
}

const pass = cliPass && gatePayloadPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.EVIDENCE_GATES_EVIDENCE_OUT ?? path.join(evidenceDir, `evidence-gates-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "evidence-gates-evidence",
  pass,
  summaryPath,
  failureReportPath: failurePath,
  checks: {
    evidenceGatesInputsPresent: true,
    evidenceGatesCliPass: cliPass,
    evidenceGatesPayloadPass: gatePayloadPass,
  },
  steps: [
    {
      id: "run_evidence_gates",
      exitCode,
      pass: cliPass,
      stderr: (scan.stderr ?? "").slice(0, 4000),
      stdout: (scan.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
