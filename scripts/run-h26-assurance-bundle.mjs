#!/usr/bin/env node
/**
 * Horizon H26 assurance bundle (non-terminal vs **H27**): **`run-h25-assurance-bundle`** then **`check:stage-promotion-readiness`**
 * (canary target, horizon mismatch allowed — matches unified-ci).
 *
 * Prerequisites: same as **H25** — **`validate:initial-scope`** merge inputs and **`validate:all`** artifacts under **`evidence/`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H26_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H26_ASSURANCE_OUT ?? path.join(evidenceDir, `h26-assurance-bundle-${stamp}.json`);

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
    stdout: (r.stdout ?? "").slice(0, 4000),
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

const h25Bundle = runStep("run_h25_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h25-assurance-bundle.mjs"),
]);

const h25ReportPath = newestMatchingFile(evidenceDir, "h25-assurance-bundle-", ".json");
const h25PayloadPass = h25ReportPath ? readJsonPass(h25ReportPath) : false;
const h25AssuranceBundlePass = h25Bundle.pass && h25PayloadPass;

const stagePromotion = runStep("check_stage_promotion_readiness", [
  process.execPath,
  path.join(root, "scripts/check-stage-promotion-readiness.mjs"),
  "--target-stage",
  "canary",
  "--allow-horizon-mismatch",
]);

const stageReportPath = newestMatchingFile(evidenceDir, "stage-promotion-readiness-", ".json");
const stagePayloadPass = stageReportPath ? readJsonPass(stageReportPath) : false;
const stagePromotionReadinessPass = stagePromotion.pass && stagePayloadPass;

const pass = h25AssuranceBundlePass && stagePromotionReadinessPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H26",
  pass,
  checks: {
    h25AssuranceBundlePass,
    h25AssuranceBundleReportPass: h25PayloadPass,
    stagePromotionReadinessPass,
    stagePromotionReadinessReportPass: stagePayloadPass,
  },
  files: {
    h25AssuranceBundlePath: h25ReportPath || null,
    stagePromotionReadinessPath: stageReportPath || null,
  },
  steps: [h25Bundle, stagePromotion],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
