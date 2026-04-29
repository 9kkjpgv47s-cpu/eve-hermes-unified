#!/usr/bin/env node
/**
 * Horizon H27 assurance bundle (non-terminal vs **H28**): **`validate:horizon-status`** then **`run-h26-assurance-bundle`**
 * (H25 chain + stage promotion readiness). Folds the standalone **`validate:horizon-status`** CI step into the terminal bundle.
 *
 * Prerequisites: **`validate:release-readiness`** + **`validate:initial-scope`** merge inputs (or run inside **`run-h28-assurance-bundle`**) and **`validate:all`** artifacts under **`evidence/`**.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H27_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H27_ASSURANCE_OUT ?? path.join(evidenceDir, `h27-assurance-bundle-${stamp}.json`);

function runStep(id, argv) {
  const r = spawnSync(argv[0], argv.slice(1), {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });
  const exitCode = r.status ?? 1;
  return {
    id,
    exitCode,
    pass: exitCode === 0,
    stderr: (r.stderr ?? "").slice(0, 2000),
    stdout: (r.stdout ?? "").slice(0, 8000),
  };
}

function newestMatchingFile(dir, prefix, suffix) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return "";
  }
  const hits = names.filter((n) => n.startsWith(prefix) && n.endsWith(suffix)).sort();
  if (!hits.length) {
    return "";
  }
  return path.join(dir, hits[hits.length - 1]);
}

function readJsonPass(filePath) {
  try {
    const raw = readFileSync(filePath, "utf8");
    const payload = JSON.parse(raw);
    return payload?.pass === true;
  } catch {
    return false;
  }
}

function horizonStatusStdoutReportsValid(stdout) {
  const trimmed = String(stdout ?? "").trim();
  const lines = trimmed.split("\n").filter((line) => line.startsWith("{"));
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const payload = JSON.parse(lines[index]);
      if (payload && typeof payload === "object" && "valid" in payload) {
        return payload.valid === true;
      }
    } catch {
      // continue
    }
  }
  try {
    const payload = JSON.parse(trimmed);
    return payload?.valid === true;
  } catch {
    return false;
  }
}

const horizonStatus = runStep("validate_horizon_status", [
  process.execPath,
  path.join(root, "scripts/validate-horizon-status.mjs"),
  "--file",
  path.join(root, "docs/HORIZON_STATUS.json"),
]);
const horizonStatusSchemaPass = horizonStatus.pass && horizonStatusStdoutReportsValid(horizonStatus.stdout);

const h26Bundle = runStep("run_h26_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h26-assurance-bundle.mjs"),
]);

const h26ReportPath = newestMatchingFile(evidenceDir, "h26-assurance-bundle-", ".json");
const h26PayloadPass = h26ReportPath ? readJsonPass(h26ReportPath) : false;
const h26AssuranceBundlePass = h26Bundle.pass && h26PayloadPass;

const pass = horizonStatusSchemaPass && h26AssuranceBundlePass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H27",
  pass,
  checks: {
    horizonStatusValidationPass: horizonStatusSchemaPass,
    h26AssuranceBundlePass,
    h26AssuranceBundleReportPass: h26PayloadPass,
  },
  files: {
    h26AssuranceBundlePath: h26ReportPath || null,
  },
  steps: [horizonStatus, h26Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
