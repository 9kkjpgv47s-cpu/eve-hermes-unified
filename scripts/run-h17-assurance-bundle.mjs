#!/usr/bin/env node
/**
 * Horizon H17 assurance bundle: merge readiness verification — validate:merge-bundle,
 * validate:manifest-schemas on evidence/, and verify:merge-bundle against the latest bundle.
 *
 * Prerequisites (CI / operators): evidence/ contains outputs from validate:all,
 * validate:release-readiness, and validate:initial-scope so validate:merge-bundle can pack reports.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.H17_ASSURANCE_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.H17_ASSURANCE_OUT ?? path.join(evidenceDir, `h17-assurance-bundle-${stamp}.json`);

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
    stdout: (r.stdout ?? "").slice(0, 4000),
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

function newestBundleVerificationPath(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return "";
  }
  const hits = names.filter((n) => n.startsWith("bundle-verification-") && n.endsWith(".json")).sort();
  if (!hits.length) {
    return "";
  }
  return path.join(dir, hits[hits.length - 1]);
}

function parseVerifyMergePayloadPass(stdout) {
  const raw = String(stdout ?? "");
  /** Prefer embedded JSON block after npm noise (verify-merge-bundle prints pretty-printed JSON). */
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
            if (payload && typeof payload === "object" && "pass" in payload) {
              return payload.pass === true;
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
      if (payload && typeof payload === "object" && "pass" in payload) {
        return payload.pass === true;
      }
    } catch {
      /* continue */
    }
  }
  return false;
}

const mergeBundleStep = runStep("validate_merge_bundle", ["npm", "run", "validate:merge-bundle"]);

const mergeValidationPath = newestMatchingFile(evidenceDir, "merge-bundle-validation-", ".json");
const mergeBundlePayloadPass = mergeValidationPath ? readJsonPass(mergeValidationPath) : false;
const mergeBundleValidationPass = mergeBundleStep.pass && mergeBundlePayloadPass;

const manifestSchemas = runStep("validate_manifest_schemas", ["npm", "run", "validate:manifest-schemas"]);

const verifyMerge = runStep("verify_merge_bundle", [
  "npm",
  "run",
  "verify:merge-bundle",
  "--",
  "--latest",
  "--no-require-archive",
]);
const bundleVerificationPath = newestBundleVerificationPath(evidenceDir);
const mergeBundleVerifyPayloadPass =
  (bundleVerificationPath ? readJsonPass(bundleVerificationPath) : false) ||
  parseVerifyMergePayloadPass(verifyMerge.stdout);
const mergeBundleVerificationPass = verifyMerge.pass && mergeBundleVerifyPayloadPass;

const payload = {
  generatedAtIso: new Date().toISOString(),
  horizon: "H17",
  pass: mergeBundleValidationPass && manifestSchemas.pass && mergeBundleVerificationPass,
  checks: {
    mergeBundleValidationPass,
    mergeBundleValidationReportPass: mergeBundlePayloadPass,
    manifestSchemasPass: manifestSchemas.pass,
    mergeBundleVerificationPass,
    mergeBundleVerificationPayloadPass: mergeBundleVerifyPayloadPass,
  },
  files: {
    mergeBundleValidationPath: mergeValidationPath || null,
    bundleVerificationPath: bundleVerificationPath || null,
  },
  steps: [mergeBundleStep, manifestSchemas, verifyMerge],
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(payload.pass ? 0 : 1);
