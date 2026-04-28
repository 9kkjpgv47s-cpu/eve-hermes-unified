#!/usr/bin/env node
/**
 * Bounded remediation dry-run: chains tenant isolation validation + region failover rehearsal manifests.
 * Does not execute mutating operations.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.REMEDIATION_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const outFile =
  process.env.REMEDIATION_MANIFEST ??
  path.join(evidenceDir, `agent-remediation-playbook-${Date.now()}.json`);

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: "utf8", env: process.env });
  return { status: r.status ?? 1, stdout: (r.stdout ?? "").trim(), stderr: (r.stderr ?? "").trim() };
}

const tenant = run(process.execPath, [
  path.join(root, "scripts/validate-tenant-isolation.mjs"),
]);
const region = run("bash", [path.join(root, "scripts/region-failover-rehearsal.sh")]);

const manifest = {
  recordedAtIso: new Date().toISOString(),
  boundedPolicy: {
    readOnly: true,
    mutatingStepsSkipped: ["gateway_restart", "lane_cutover_apply"],
  },
  steps: [
    {
      id: "tenant_isolation_validation",
      exitCode: tenant.status,
      artifactPath: tenant.stdout.split("\n").pop() ?? "",
      stderr: tenant.stderr.slice(0, 2000),
    },
    {
      id: "region_failover_rehearsal",
      exitCode: region.status,
      artifactPath: region.stdout.split("\n").pop() ?? "",
      stderr: region.stderr.slice(0, 2000),
    },
  ],
  pass: tenant.status === 0 && region.status === 0,
};

writeFileSync(outFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
process.stdout.write(`${outFile}\n`);
process.exit(manifest.pass ? 0 : 1);
