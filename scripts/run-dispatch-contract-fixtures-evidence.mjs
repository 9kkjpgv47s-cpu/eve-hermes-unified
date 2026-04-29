#!/usr/bin/env node
/**
 * Records machine-readable evidence that canonical **`UnifiedDispatchResult`** JSON fixtures validate (H29 closeout).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceDir = process.env.DISPATCH_CONTRACT_FIXTURES_EVIDENCE_DIR ?? path.join(root, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const validateJs = path.join(root, "dist/src/contracts/validate.js");
const require = createRequire(import.meta.url);
let validateUnifiedDispatchResult;
try {
  ({ validateUnifiedDispatchResult } = require(validateJs));
} catch {
  process.stderr.write(`Missing compiled contract validator at ${validateJs}; run npm run build first.\n`);
  process.exit(1);
}

const fixtureDir = path.join(root, "test/fixtures/contracts");
const names = readdirSync(fixtureDir).filter((n) => n.endsWith(".json")).sort();

const schemaVersionPath = path.join(root, "src/contracts/schema-version.ts");
const schemaRaw = readFileSync(schemaVersionPath, "utf8");
const versionMatch = schemaRaw.match(/UNIFIED_DISPATCH_CONTRACT_VERSION\s*=\s*"([^"]+)"/);
const contractVersion = versionMatch ? versionMatch[1] : "";

const fixtureResults = [];
let allPass = true;
for (const name of names) {
  const filePath = path.join(fixtureDir, name);
  let ok = false;
  let error = "";
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    validateUnifiedDispatchResult(parsed);
    ok = true;
  } catch (e) {
    ok = false;
    error = String(e?.message ?? e);
    allPass = false;
  }
  fixtureResults.push({ file: name, pass: ok, error: error ? error.slice(0, 500) : "" });
}

const pass = allPass && names.length > 0 && Boolean(contractVersion);
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
const outPath =
  process.env.DISPATCH_CONTRACT_FIXTURES_EVIDENCE_OUT ??
  path.join(evidenceDir, `dispatch-contract-fixtures-evidence-${stamp}.json`);

const payload = {
  generatedAtIso: new Date().toISOString(),
  kind: "dispatch-contract-fixtures-evidence",
  pass,
  contractVersion,
  fixtureDir: path.relative(root, fixtureDir),
  checks: {
    contractVersionReported: Boolean(contractVersion),
    fixtureCountPositive: names.length > 0,
    allFixturesValidatedPass: allPass,
  },
  fixtures: fixtureResults,
};

writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
process.stdout.write(`${outPath}\n`);
process.exit(pass ? 0 : 1);
