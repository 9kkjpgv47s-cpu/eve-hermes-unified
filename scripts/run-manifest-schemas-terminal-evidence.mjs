#!/usr/bin/env node
/**
 * Records evidence that validate:manifest-schemas passes and the newest post-H26 sustainment loop manifest is schema-valid (H27).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.MANIFEST_SCHEMAS_TERMINAL_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const sweep = spawnSync("npm", ["run", "validate:manifest-schemas"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});
const sweepExit = sweep.status ?? 1;

const loopNames = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("post-h26-sustainment-loop-") && n.endsWith(".json"))
  .sort();
const loopPath = loopNames.length ? path.join(evidenceDir, loopNames[loopNames.length - 1]) : "";

let schemaPass = false;
let payloadPass = false;
if (loopPath) {
  try {
    const payload = JSON.parse(readFileSync(loopPath, "utf8"));
    const v = validateManifestSchema("post-h26-sustainment-loop", payload);
    schemaPass = v.valid;
    payloadPass = payload?.pass === true;
  } catch {
    schemaPass = false;
  }
}

const pass = sweepExit === 0 && schemaPass && payloadPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.MANIFEST_SCHEMAS_TERMINAL_EVIDENCE_OUT ??
  path.join(evidenceDir, `manifest-schemas-terminal-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "manifest-schemas-terminal-evidence",
  pass,
  sustainmentLoopManifestPath: loopPath,
  checks: {
    manifestSchemasSweepPass: sweepExit === 0,
    postH26SustainmentLoopSchemaPass: schemaPass,
    postH26SustainmentLoopPayloadPass: payloadPass,
  },
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
