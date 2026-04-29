#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h6-sustainment-loop-*.json against closeout rules
 * (use after npm run verify:sustainment-loop).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { newestMatchingEvidenceFile } from "./lib/newest-evidence-manifest.mjs";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H6_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");


const manifestPath = await newestMatchingEvidenceFile(evidenceDir, "post-h6-sustainment-loop-");
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h6-sustainment-loop-*.json under ${evidenceDir}\n`);
  process.exit(2);
}

const raw = await readFile(manifestPath, "utf8");
const payload = JSON.parse(raw);
const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};

const failures = [];
if (payload.pass !== true) failures.push("pass_not_true");
if (checks.horizonStatusPass !== true) failures.push("horizonStatusPass");
if (checks.h6AssuranceBundlePass !== true) failures.push("h6AssuranceBundlePass");
if (checks.h6CloseoutGatePass !== true) failures.push("h6CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H6 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
