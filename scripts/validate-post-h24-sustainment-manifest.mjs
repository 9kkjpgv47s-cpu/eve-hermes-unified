#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h24-sustainment-loop-*.json (after npm run verify:sustainment-loop).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H24_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");

async function newestLoopManifest(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.startsWith("post-h24-sustainment-loop-") && e.name.endsWith(".json"))
    .map((e) => path.join(dir, e.name))
    .sort();
  return files.length ? files[files.length - 1] : "";
}

const manifestPath = await newestLoopManifest(evidenceDir);
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
if (checks.h17AssuranceBundlePass !== true) failures.push("h17AssuranceBundlePass");
if (checks.h18AssuranceBundlePass !== true) failures.push("h18AssuranceBundlePass");
if (checks.ciSoakSloGatePass !== true) failures.push("ciSoakSloGatePass");
if (checks.unifiedEntrypointsEvidencePass !== true) failures.push("unifiedEntrypointsEvidencePass");
if (checks.shellUnifiedDispatchCiEvidencePass !== true) failures.push("shellUnifiedDispatchCiEvidencePass");
if (checks.evidenceGatesEvidencePass !== true) failures.push("evidenceGatesEvidencePass");
if (checks.tenantIsolationEvidencePass !== true) failures.push("tenantIsolationEvidencePass");
if (checks.regionFailoverEvidencePass !== true) failures.push("regionFailoverEvidencePass");
if (checks.h24CloseoutGatePass !== true) failures.push("h24CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H24 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
