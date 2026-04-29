#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h27-sustainment-loop-*.json (legacy replay via **`npm run verify:sustainment-loop:h27-legacy`**).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { newestMatchingEvidenceFile } from "./lib/newest-evidence-manifest.mjs";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H27_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");


const manifestPath = await newestMatchingEvidenceFile(evidenceDir, "post-h27-sustainment-loop-");
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h27-sustainment-loop-*.json under ${evidenceDir}\n`);
  process.exit(2);
}

const raw = await readFile(manifestPath, "utf8");
const payload = JSON.parse(raw);
const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};

const failures = [];
if (payload.pass !== true) failures.push("pass_not_true");
if (checks.h27AssuranceBundlePass !== true) failures.push("h27AssuranceBundlePass");
if (checks.h27CloseoutGatePass !== true) failures.push("h27CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H27 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
