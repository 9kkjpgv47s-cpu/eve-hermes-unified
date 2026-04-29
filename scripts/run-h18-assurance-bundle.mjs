#!/usr/bin/env node
/**
 * Horizon H18 assurance bundle: H17 merge readiness plus stage-promotion readiness (matches unified-ci tail).
 *
 * Prerequisites: same as run-h17-assurance-bundle — evidence/ must contain validate:all + release-readiness +
 * initial-scope outputs so merge-bundle and stage-promotion gates can resolve artifacts.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
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

const h17Bundle = runStep("run_h17_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h17-assurance-bundle.mjs"),
]);

const h17ReportPath = newestMatchingFile(evidenceDir, "h17-assurance-bundle-", ".json");
const h17PayloadPass = h17ReportPath ? readJsonPass(h17ReportPath) : false;
const h17Pass = h17Bundle.pass && h17PayloadPass;

/** Matches unified-ci: canary probe with horizon mismatch allowed when evidence predates status bumps. */
const stagePromotion = runStep("check_stage_promotion_readiness", [
  "npm",
  "run",
  "check:stage-promotion-readiness",
  "--",
  "--target-stage",
  "canary",
  "--allow-horizon-mismatch",
]);

const stagePromotionPath = newestMatchingFile(evidenceDir, "stage-promotion-readiness-", ".json");
const stagePromotionPayloadPass = stagePromotionPath ? readJsonPass(stagePromotionPath) : false;
const stagePromotionPass = stagePromotion.pass && stagePromotionPayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H18",
  pass: h17Pass && stagePromotionPass,
  checks: {
    h17AssuranceBundlePass: h17Pass,
    h17AssuranceBundleReportPass: h17PayloadPass,
    stagePromotionReadinessPass: stagePromotionPass,
    stagePromotionReadinessReportPass: stagePromotionPayloadPass,
  },
  files: {
    h17AssuranceBundlePath: h17ReportPath || null,
    stagePromotionReadinessPath: stagePromotionPath || null,
  },
  steps: [h17Bundle, stagePromotion],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
