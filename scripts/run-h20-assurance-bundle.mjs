#!/usr/bin/env node
/**
 * Horizon H20 assurance bundle: validation-summary ↔ failure-injection evidence gate (`validate:evidence-gates`)
 * plus H19 (horizon-status + H18 merge/stage) chain.
 *
 * Prerequisites: **`validate:all`** (or equivalent) so **`evidence/validation-summary-*.json`** and **`evidence/failure-injection-*.txt`** exist.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H20_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H20_ASSURANCE_OUT ?? path.join(evidenceDir, `h20-assurance-bundle-${stamp}.json`);

function runStep(id, argv) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
    stdout: (r.stdout ?? "").slice(0, 8000),
  };
}

function newestMatchingFile(dir, prefix, suffix) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return "";
  }
  const hits = names.filter((n) => n.startsWith(prefix) && n.endsWith(suffix)).sort();
  if (!hits.length) {
    return "";
  }
  return path.join(dir, hits[hits.length - 1]);
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

/** Parse single-line JSON from evidence-gates stdout (may follow npm noise). */
function parseEvidenceGatesPayloadPass(stdout) {
  const raw = String(stdout ?? "");
  const braceIdx = raw.lastIndexOf("{");
  if (braceIdx >= 0) {
    let depth = 0;
    for (let i = braceIdx; i < raw.length; i += 1) {
      const c = raw[i];
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const payload = JSON.parse(raw.slice(braceIdx, i + 1));
            if (payload && typeof payload === "object" && "pass" in payload) {
              return payload.pass === true;
            }
          } catch {
            /* fall through */
          }
          break;
        }
      }
    }
  }
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const payload = JSON.parse(lines[i]);
      if (payload && typeof payload === "object" && "pass" in payload) {
        return payload.pass === true;
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

const validationSummaryPath = newestMatchingFile(evidenceDir, "validation-summary-", ".json");
const failureInjectionPath = newestMatchingFile(evidenceDir, "failure-injection-", ".txt");

let evidenceGatesStep = {
  id: "validate_evidence_gates",
  exitCode: 2,
  pass: false,
  stderr: "",
  stdout: "",
};
let evidenceGatesPayloadPass = false;

if (!validationSummaryPath || !failureInjectionPath) {
  evidenceGatesStep = {
    ...evidenceGatesStep,
    stderr: !validationSummaryPath
      ? "missing validation-summary-*.json under evidence"
      : "missing failure-injection-*.txt under evidence",
  };
} else {
  evidenceGatesStep = runStep("validate_evidence_gates", [
    process.execPath,
    path.join(root, "scripts/evidence-gates.mjs"),
    "--summary",
    validationSummaryPath,
    "--failure-report",
    failureInjectionPath,
    "--require-failure-scenarios",
    "--max-p95-ms",
    "2500",
  ]);
  evidenceGatesPayloadPass = parseEvidenceGatesPayloadPass(evidenceGatesStep.stdout);
}

const evidenceGatesPass = evidenceGatesStep.pass && evidenceGatesPayloadPass;

const h19Bundle = runStep("run_h19_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h19-assurance-bundle.mjs"),
]);

const h19ReportPath = newestMatchingFile(evidenceDir, "h19-assurance-bundle-", ".json");
const h19PayloadPass = h19ReportPath ? readJsonPass(h19ReportPath) : false;
const h19Pass = h19Bundle.pass && h19PayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H20",
  pass: evidenceGatesPass && h19Pass,
  checks: {
    evidenceGatesPass,
    evidenceGatesPayloadPass,
    h19AssuranceBundlePass: h19Pass,
    h19AssuranceBundleReportPass: h19PayloadPass,
  },
  files: {
    validationSummaryPath: validationSummaryPath || null,
    failureInjectionPath: failureInjectionPath || null,
    h19AssuranceBundlePath: h19ReportPath || null,
  },
  steps: [evidenceGatesStep, h19Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
