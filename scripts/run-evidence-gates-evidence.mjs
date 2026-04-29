#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:evidence-gates (validation summary + failure-injection report; H23 closeout).
 * Pairs the latest **`validation-summary-*.json`** with the latest **`failure-injection-*.txt`**
 * under **`evidence/`**, runs **`node ./scripts/evidence-gates.mjs`**, and writes **`evidence/evidence-gates-evidence-*.json`**.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.EVIDENCE_GATES_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function newestMatching(prefix, suffix) {
  const names = readdirSync(evidenceDir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(suffix))
    .sort();
  return names.length ? path.join(evidenceDir, names[names.length - 1]) : "";
}

const summaryPath = newestMatching("validation-summary-", ".json");
const failurePath = newestMatching("failure-injection-", ".txt");

if (!summaryPath || !failurePath) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath =
    process.env.EVIDENCE_GATES_EVIDENCE_OUT ??
    path.join(evidenceDir, `evidence-gates-evidence-${stamp}.json`);
  const payload = {
    generatedAtIso: new Date().toISOString(),
    kind: "evidence-gates-evidence",
    pass: false,
    summaryPath: summaryPath || null,
    failureReportPath: failurePath || null,
    checks: {
      evidenceGatesInputsPresent: false,
      evidenceGatesCliPass: false,
    },
    steps: [
      {
        id: "resolve_inputs",
        exitCode: 1,
        pass: false,
        stderr: !summaryPath
          ? "missing validation-summary-*.json under evidence (run validate:evidence-summary after validate:all)"
          : !failurePath
            ? "missing failure-injection-*.txt under evidence (run validate:failure-injection)"
            : "",
        stdout: "",
      },
    ],
  };
  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
  process.exit(1);
}

const maxP95MsRaw = process.env.UNIFIED_EVIDENCE_GATES_MAX_P95_MS ?? "2500";
const gate = spawnSync(
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
    String(maxP95MsRaw),
  ],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  },
);

const exitCode = gate.status ?? 1;
let parsed = null;
const out = (gate.stdout ?? "").trim();
try {
  parsed = out ? JSON.parse(out.split("\n").filter(Boolean).pop() ?? "") : null;
} catch {
  parsed = null;
}

const cliPass = exitCode === 0 && parsed?.pass === true;
const pass = cliPass;
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
  },
  evidenceGates: parsed,
  steps: [
    {
      id: "validate_evidence_gates",
      exitCode,
      pass: cliPass,
      stderr: (gate.stderr ?? "").slice(0, 4000),
      stdout: (gate.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
