#!/usr/bin/env node
/**
 * Records machine-readable evidence for rehearse:region-failover (H24 closeout).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.REGION_FAILOVER_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const rehearsal = spawnSync("npm", ["run", "rehearse:region-failover"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  shell: true,
});
const rehearsalExit = rehearsal.status ?? 1;

const names = readdirSync(evidenceDir)
  .filter((n) => n.startsWith("region-failover-rehearsal-") && n.endsWith(".json"))
  .sort();
const manifestPath = names.length ? path.join(evidenceDir, names[names.length - 1]) : "";

let swapPass = false;
if (manifestPath) {
  try {
    const j = JSON.parse(readFileSync(manifestPath, "utf8"));
    swapPass = j?.pass === true && j?.checks?.standbySwapApplied === true;
  } catch {
    swapPass = false;
  }
}

const pass = rehearsalExit === 0 && swapPass;
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.REGION_FAILOVER_EVIDENCE_OUT ??
  path.join(evidenceDir, `region-failover-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "region-failover-evidence",
  pass,
  checks: {
    rehearsalCliPass: rehearsalExit === 0,
    standbySwapManifestPass: swapPass,
  },
  manifestPath: manifestPath ? path.relative(root, manifestPath) : "",
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
