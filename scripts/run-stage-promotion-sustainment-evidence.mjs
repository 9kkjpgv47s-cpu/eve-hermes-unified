#!/usr/bin/env node
/**
 * Stage promotion sustainment probe (H28): readiness check for canary with horizon mismatch allowed.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.STAGE_PROMOTION_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const stampPre = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const readinessOut = path.join(evidenceDir, `stage-promotion-readiness-${stampPre}.json`);

const check = spawnSync(
  "npm",
  [
    "run",
    "check:stage-promotion-readiness",
    "--",
    "--target-stage",
    "canary",
    "--current-stage",
    "shadow",
    "--allow-horizon-mismatch",
    "--evidence-dir",
    evidenceDir,
    "--horizon-status-file",
    path.join(root, "docs/HORIZON_STATUS.json"),
    "--out",
    readinessOut,
  ],
  { cwd: root, encoding: "utf8", env: process.env, shell: true },
);
const checkExit = check.status ?? 1;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("stage-promotion-readiness-") && n.endsWith(".json"))
  .sort();
const readinessPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : "";

let schemaPass = false;
let payloadPass = false;
if (readinessPath) {
  try {
    const payload = JSON.parse(readFileSync(readinessPath, "utf8"));
    const v = validateManifestSchema("stage-promotion-readiness", payload);
    schemaPass = v.valid;
    payloadPass = payload?.pass === true;
  } catch {
    schemaPass = false;
  }
}

const pass = checkExit === 0 && schemaPass && payloadPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.STAGE_PROMOTION_SUSTAINMENT_EVIDENCE_OUT ??
  path.join(evidenceDir, `stage-promotion-sustainment-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "stage-promotion-sustainment-evidence",
  pass,
  readinessManifestPath: readinessPath,
  checks: {
    stagePromotionReadinessCliPass: checkExit === 0,
    readinessSchemaPass: schemaPass,
    readinessPayloadPass: payloadPass,
  },
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
