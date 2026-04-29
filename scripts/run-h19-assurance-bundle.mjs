#!/usr/bin/env node
/**
 * Horizon H19 assurance bundle: docs/HORIZON_STATUS.json schema gate plus H18 (merge + stage-promotion) chain.
 *
 * Consolidates **`npm run validate:horizon-status`** with **`run-h18-assurance-bundle`** so CI/sustainment do not run horizon metadata validation as a separate tail step.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H19_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H19_ASSURANCE_OUT ?? path.join(evidenceDir, `h19-assurance-bundle-${stamp}.json`);

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

/** Extract valid flag from validate-horizon-status stdout (JSON after npm noise). */
function parseHorizonStatusValid(stdout) {
  const raw = String(stdout ?? "");
  const braceIdx = raw.lastIndexOf("{");
  if (braceIdx >= 0) {
    let depth = 0;
    for (let i = braceIdx; i < raw.length; i += 1) {
      const c = raw[i];
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          try {
            const payload = JSON.parse(raw.slice(braceIdx, i + 1));
            if (payload && typeof payload === "object" && "valid" in payload) {
              return payload.valid === true;
            }
          } catch {
            /* fall through */
          }
          break;
        }
      }
    }
  }
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const payload = JSON.parse(lines[i]);
      if (payload && typeof payload === "object" && "valid" in payload) {
        return payload.valid === true;
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

const horizonStatus = runStep("validate_horizon_status", ["npm", "run", "validate:horizon-status"]);
const horizonStatusPayloadValid = parseHorizonStatusValid(horizonStatus.stdout);
const horizonStatusPass = horizonStatus.pass && horizonStatusPayloadValid;

const h18Bundle = runStep("run_h18_assurance_bundle", [
  process.execPath,
  path.join(root, "scripts/run-h18-assurance-bundle.mjs"),
]);

const h18ReportPath = newestMatchingFile(evidenceDir, "h18-assurance-bundle-", ".json");
const h18PayloadPass = h18ReportPath ? readJsonPass(h18ReportPath) : false;
const h18Pass = h18Bundle.pass && h18PayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H19",
  pass: horizonStatusPass && h18Pass,
  checks: {
    horizonStatusMetadataPass: horizonStatusPass,
    horizonStatusValidationPayloadValid: horizonStatusPayloadValid,
    h18AssuranceBundlePass: h18Pass,
    h18AssuranceBundleReportPass: h18PayloadPass,
  },
  files: {
    h18AssuranceBundlePath: h18ReportPath || null,
  },
  steps: [horizonStatus, h18Bundle],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
