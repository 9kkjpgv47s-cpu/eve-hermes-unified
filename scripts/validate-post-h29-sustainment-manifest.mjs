#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h29-sustainment-loop-*.json (legacy replay via **`npm run verify:sustainment-loop:h29-legacy`**).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { newestMatchingEvidenceFile } from "./lib/newest-evidence-manifest.mjs";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H29_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");


const manifestPath = await newestMatchingEvidenceFile(evidenceDir, "post-h29-sustainment-loop-");
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h29-sustainment-loop-*.json under ${evidenceDir}\n`);
  process.exit(2);
}

const raw = await readFile(manifestPath, "utf8");
const payload = JSON.parse(raw);
const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};

const failures = [];
if (payload.pass !== true) failures.push("pass_not_true");
if (checks.h29AssuranceBundlePass !== true) failures.push("h29AssuranceBundlePass");
if (checks.h29CloseoutGatePass !== true) failures.push("h29CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H29 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
