#!/usr/bin/env node
/**
 * Bounded shadow→canary stage-promotion readiness for terminal sustainment (H28 closeout).
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

const readinessScript = path.join(root, "scripts/check-stage-promotion-readiness.mjs");
const scan = spawnSync(
  process.execPath,
  [
    readinessScript,
    "--evidence-dir",
    evidenceDir,
    "--horizon-status-file",
    path.join(root, "docs/HORIZON_STATUS.json"),
    "--target-stage",
    "canary",
    "--current-stage",
    "shadow",
    "--allow-horizon-mismatch",
  ],
  { cwd: root, encoding: "utf8", env: process.env },
);

const exitCode = scan.status ?? 1;
const cmdPass = exitCode === 0;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("stage-promotion-readiness-") && n.endsWith(".json"))
  .sort();
const readinessPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : null;

let payloadPass = false;
let schemaPass = false;
if (readinessPath) {
  try {
    const raw = readFileSync(readinessPath, "utf8");
    const j = JSON.parse(raw);
    payloadPass = j?.pass === true;
    const schema = validateManifestSchema("stage-promotion-readiness", j);
    schemaPass = schema.valid === true;
  } catch {
    payloadPass = false;
    schemaPass = false;
  }
}

const pass = cmdPass && payloadPass && schemaPass;
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
    stagePromotionReadinessCommandPass: cmdPass,
    stagePromotionReadinessPayloadPass: payloadPass,
    stagePromotionReadinessSchemaPass: schemaPass,
  },
  steps: [
    {
      id: "check_stage_promotion_readiness",
      exitCode,
      pass: cmdPass,
      stderr: (scan.stderr ?? "").slice(0, 4000),
      stdout: (scan.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
