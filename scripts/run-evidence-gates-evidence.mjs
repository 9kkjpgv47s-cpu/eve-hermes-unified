#!/usr/bin/env node
/**
 * Records machine-readable evidence for validate:evidence-gates (H23 closeout).
 * Pairs the newest validation summary with the newest failure-injection report under evidence/.
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
    .filter((n) => n.startsWith(prefix) && n.endsWith(suffix))
    .sort();
  return names.length ? path.join(evidenceDir, names[names.length - 1]) : "";
}

const summaryPath = newestMatching("validation-summary-", ".json");
const failurePath = newestMatching("failure-injection-", ".txt");
const haveInputs = Boolean(summaryPath && failurePath);

let exitCode = 1;
if (haveInputs) {
  const r = spawnSync(
    process.execPath,
    [
      path.join(root, "scripts/evidence-gates.mjs"),
      "--summary",
      summaryPath,
      "--failure-report",
      failurePath,
      "--require-failure-scenarios",
    ],
    { cwd: root, encoding: "utf8", env: process.env },
  );
  exitCode = r.status ?? 1;
}

const pass = haveInputs && exitCode === 0;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.EVIDENCE_GATES_EVIDENCE_OUT ??
  path.join(evidenceDir, `evidence-gates-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "evidence-gates-evidence",
  pass,
  checks: {
    inputsResolved: haveInputs,
    evidenceGatesCliPass: exitCode === 0,
  },
  paths: {
    validationSummary: summaryPath ? path.relative(root, summaryPath) : "",
    failureInjection: failurePath ? path.relative(root, failurePath) : "",
  },
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
