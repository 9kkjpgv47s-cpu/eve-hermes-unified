#!/usr/bin/env node
/**
 * Post-H27: post-H26 chain + manifest schema terminal pin + H27 closeout.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.POST_H27_SUSTAINMENT_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

function runNode(scriptRel) {
  const script = path.join(root, scriptRel);
  const r = spawnSync(process.execPath, [script], { cwd: root, encoding: "utf8", env: process.env });
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
  process.env.POST_H27_SUSTAINMENT_LOOP_OUT ??
  path.join(evidenceDir, `post-h27-sustainment-loop-${stamp}.json`);

const postH26 = runNode("scripts/run-post-h26-sustainment-loop.mjs");
const manifestTerminal = runNpm("run:manifest-schemas-terminal-evidence");
const closeout = runNpm("validate:h27-closeout");

const postH26ChainPass = postH26.exitCode === 0;
const manifestSchemasTerminalEvidencePass = manifestTerminal.exitCode === 0;
const h27CloseoutGatePass = closeout.exitCode === 0;
const pass = postH26ChainPass && manifestSchemasTerminalEvidencePass && h27CloseoutGatePass;

const manifest = {
  generatedAtIso: new Date().toISOString(),
  pass,
  checks: {
    postH26SustainmentChainPass: postH26ChainPass,
    manifestSchemasTerminalEvidencePass,
    h27CloseoutGatePass,
  },
  steps: [
    { id: "run_post_h26_sustainment_loop", ...postH26 },
    { id: "run_manifest_schemas_terminal_evidence", ...manifestTerminal },
    { id: "validate_h27_closeout", ...closeout },
  ],
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${manifestPath}\n`);
process.exit(pass ? 0 : 1);
