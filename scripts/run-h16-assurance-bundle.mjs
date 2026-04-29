#!/usr/bin/env node
/**
 * Horizon H16 sustainment bundle: horizon metadata validation only.
 *
 * Goal-policy file validation (**`validate:goal-policy-file`**) and evidence manifest schema sweep (**`validate:manifest-schemas`**),
 * plus the operational gates formerly chained here, run in **`run-h23-assurance-bundle.mjs`** after **`validate:release-readiness`** /
 * **`validate:initial-scope`** / **`validate:all`** (also chained under **`run-h24-assurance-bundle`** inside **`run-h25-assurance-bundle`**).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H16_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H16_ASSURANCE_OUT ?? path.join(evidenceDir, `h16-assurance-bundle-${stamp}.json`);

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
  };
}

const horizonStatus = runStep("validate_horizon_status", [
  process.execPath,
  path.join(root, "scripts/validate-horizon-status.mjs"),
  "--file",
  path.join(root, "docs/HORIZON_STATUS.json"),
]);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H16",
  pass: horizonStatus.pass,
  checks: {
    horizonStatusPass: horizonStatus.pass,
  },
  steps: [horizonStatus],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
