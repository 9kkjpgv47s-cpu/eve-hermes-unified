#!/usr/bin/env node
/**
 * Post-H28 sustainment loop: full post-H27 chain plus manifest schema pin on post-H27 loop, stage-promotion sustainment evidence, and H28 closeout gate.
 *
 * Run **`npm run run:h16-assurance-bundle`** first when reproducing a full chain locally or after **`npm run validate:all`** when **`evidence/`** lacks goal-policy output through **H28**.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H28_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function runNode(scriptRel, env = process.env) {
  const script = path.join(root, scriptRel);
  const r = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  return {
    script: scriptRel,
    exitCode: r.status ?? 1,
    stderr: (r.stderr ?? "").slice(0, 4000),
    stdout: (r.stdout ?? "").slice(0, 4000),
  };
}

function runNpm(script) {
  const r = spawnSync("npm", ["run", script], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    shell: true,
  });
  return {
    script,
    exitCode: r.status ?? 1,
    stderr: (r.stderr ?? "").slice(0, 4000),
    stdout: (r.stdout ?? "").slice(0, 4000),
  };
}

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const manifestPath =
  process.env.POST_H28_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h28-sustainment-loop-${stamp}.json`);

const postH27 = runNode("scripts/run-post-h27-sustainment-loop.mjs");
const manifestSchemasPostH27 = runNpm("run:manifest-schemas-post-h27-loop-evidence");
const stagePromotion = runNpm("run:stage-promotion-sustainment-evidence");
const closeout = runNpm("validate:h28-closeout");

const postH27SustainmentChainPass = postH27.exitCode === 0;
const manifestSchemasPostH27LoopEvidencePass = manifestSchemasPostH27.exitCode === 0;
const stagePromotionSustainmentEvidencePass = stagePromotion.exitCode === 0;
const h28CloseoutGatePass = closeout.exitCode === 0;
const pass =
  postH27SustainmentChainPass &&
  manifestSchemasPostH27LoopEvidencePass &&
  stagePromotionSustainmentEvidencePass &&
  h28CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH27SustainmentChainPass,
    manifestSchemasPostH27LoopEvidencePass,
    stagePromotionSustainmentEvidencePass,
    h28CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h27_sustainment_loop", ...postH27 },
    { id: "run_manifest_schemas_post_h27_loop_evidence", ...manifestSchemasPostH27 },
    { id: "run_stage_promotion_sustainment_evidence", ...stagePromotion },
    { id: "validate_h28_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
