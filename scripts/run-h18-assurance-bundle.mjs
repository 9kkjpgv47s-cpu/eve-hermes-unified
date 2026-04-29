#!/usr/bin/env node
/**
 * Horizon H18 assurance bundle: H17 gates plus bounded evidence prune rehearsal (non-zero TTL dry path).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H18_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H18_ASSURANCE_OUT ?? path.join(evidenceDir, `h18-assurance-bundle-${stamp}.json`);

function runStep(id, argv, extraEnv = {}) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
  };
}

const h17Bundle = runStep("run_h17_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h17-assurance-bundle.mjs"),
]);

/** Rehearse prune with a short TTL so the script exercises age logic without deleting recent evidence. */
const pruneRehearsal = runStep(
  "prune_evidence_rehearsal",
  [process.execPath, path.join(root, "scripts/prune-evidence.mjs"), "--dry-run", "--ttl-days", "36500"],
  { UNIFIED_EVIDENCE_PRUNE_TTL_DAYS: "36500" },
);

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H18",
  pass: h17Bundle.pass && pruneRehearsal.pass,
  checks: {
    h17AssuranceBundlePass: h17Bundle.pass,
    evidencePruneRehearsalPass: pruneRehearsal.pass,
  },
  steps: [h17Bundle, pruneRehearsal],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
