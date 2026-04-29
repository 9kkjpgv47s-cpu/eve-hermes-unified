#!/usr/bin/env node
/**
 * Records evidence for validate:manifest-schemas on the newest post-H28 sustainment loop (H29 closeout).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.MANIFEST_SCHEMAS_POST_H28_LOOP_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const scan = spawnSync("npm", ["run", "validate:manifest-schemas"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});

const npmExit = scan.status ?? 1;
const npmPass = npmExit === 0;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("post-h28-sustainment-loop-") && n.endsWith(".json"))
  .sort();
const sustainmentPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : null;

let schemaPass = false;
let payloadPass = false;
if (sustainmentPath) {
  try {
    const raw = readFileSync(sustainmentPath, "utf8");
    const j = JSON.parse(raw);
    payloadPass = j?.pass === true;
    const schema = validateManifestSchema("post-h28-sustainment-loop", j);
    schemaPass = schema.valid === true;
  } catch {
    schemaPass = false;
    payloadPass = false;
  }
}

const pass = npmPass && schemaPass && payloadPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.MANIFEST_SCHEMAS_POST_H28_LOOP_EVIDENCE_OUT ??
  path.join(evidenceDir, `manifest-schemas-post-h28-loop-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "manifest-schemas-post-h28-loop-evidence",
  pass,
  sustainmentLoopManifestPath: sustainmentPath,
  checks: {
    manifestSchemasSweepPass: npmPass,
    postH28SustainmentLoopSchemaPass: schemaPass,
    postH28SustainmentLoopPayloadPass: payloadPass,
  },
  steps: [
    {
      id: "validate_manifest_schemas",
      exitCode: npmExit,
      pass: npmPass,
      stderr: (scan.stderr ?? "").slice(0, 4000),
      stdout: (scan.stdout ?? "").slice(0, 4000),
    },
  ],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
