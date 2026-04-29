#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H29_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");

async function newestLoopManifest(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.startsWith("post-h29-sustainment-loop-") && e.name.endsWith(".json"))
    .map((e) => path.join(dir, e.name))
    .sort();
  return files.length ? files[files.length - 1] : "";
}

const manifestPath = await newestLoopManifest(evidenceDir);
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h29-sustainment-loop-*.json under ${evidenceDir}\n`);
  process.exit(2);
}

const raw = await readFile(manifestPath, "utf8");
const payload = JSON.parse(raw);
const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};

const failures = [];
if (payload.pass !== true) failures.push("pass_not_true");
if (checks.postH28SustainmentChainPass !== true) failures.push("postH28SustainmentChainPass");
if (checks.manifestSchemasPostH28LoopEvidencePass !== true) failures.push("manifestSchemasPostH28LoopEvidencePass");
if (checks.dispatchContractFixturesEvidencePass !== true) failures.push("dispatchContractFixturesEvidencePass");
if (checks.h29CloseoutGatePass !== true) failures.push("h29CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H29 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
