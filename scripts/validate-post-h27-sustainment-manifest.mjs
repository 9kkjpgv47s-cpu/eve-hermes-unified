#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h27-sustainment-loop-*.json (after npm run verify:sustainment-loop:h27-legacy).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H27_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");

async function newestLoopManifest(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.startsWith("post-h27-sustainment-loop-") && e.name.endsWith(".json"))
    .map((e) => path.join(dir, e.name))
    .sort();
  return files.length ? files[files.length - 1] : "";
}

const manifestPath = await newestLoopManifest(evidenceDir);
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h27-sustainment-loop-*.json under ${evidenceDir}\n`);
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
if (checks.agentRemediationEvidencePass !== true) failures.push("agentRemediationEvidencePass");
if (checks.emergencyRollbackEvidencePass !== true) failures.push("emergencyRollbackEvidencePass");
if (checks.manifestSchemasTerminalEvidencePass !== true) failures.push("manifestSchemasTerminalEvidencePass");
if (checks.h27CloseoutGatePass !== true) failures.push("h27CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H27 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
