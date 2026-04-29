#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h24-sustainment-loop-*.json (legacy replay via **`npm run verify:sustainment-loop:h24-legacy`**).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { newestMatchingEvidenceFile } from "./lib/newest-evidence-manifest.mjs";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H24_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");


const manifestPath = await newestMatchingEvidenceFile(evidenceDir, "post-h24-sustainment-loop-");
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h24-sustainment-loop-*.json under ${evidenceDir}\n`);
  process.exit(2);
}

const raw = await readFile(manifestPath, "utf8");
const payload = JSON.parse(raw);
const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};

const failures = [];
if (payload.pass !== true) failures.push("pass_not_true");
if (checks.horizonStatusPass !== true) failures.push("horizonStatusPass");
if (checks.h24AssuranceBundlePass !== true) failures.push("h24AssuranceBundlePass");
if (checks.h24CloseoutGatePass !== true) failures.push("h24CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H24 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
