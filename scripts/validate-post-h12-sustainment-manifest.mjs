#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h12-sustainment-loop-*.json (after npm run verify:sustainment-loop).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { newestMatchingEvidenceFile } from "./lib/newest-evidence-manifest.mjs";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H12_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");


const manifestPath = await newestMatchingEvidenceFile(evidenceDir, "post-h12-sustainment-loop-");
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h12-sustainment-loop-*.json under ${evidenceDir}\n`);
  process.exit(2);
}

const raw = await readFile(manifestPath, "utf8");
const payload = JSON.parse(raw);
const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};

const failures = [];
if (payload.pass !== true) failures.push("pass_not_true");
if (checks.horizonStatusPass !== true) failures.push("horizonStatusPass");
if (checks.h12AssuranceBundlePass !== true) failures.push("h12AssuranceBundlePass");
if (checks.h12CloseoutGatePass !== true) failures.push("h12CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H12 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
