#!/usr/bin/env node
/**
 * H9 (h9-action-2): after validate:h9-closeout, regression, and cutover readiness,
 * emit a single machine-readable posture proving the tail of `validate:all` passed.
 * Writes `validate-all-chain-posture-*.json` (schema h9-validate-all-chain-v1).
 */
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_VERSION = "h9-validate-all-chain-v1";

function parseArgs(argv) {
  const opts = { evidenceDir: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir" && argv[i + 1]) {
      opts.evidenceDir = argv[i + 1];
      i += 1;
    } else if (a === "--out" && argv[i + 1]) {
      opts.out = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

async function newestMatchingFile(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && predicate(e.name)).map((e) => path.join(dir, e.name));
  if (files.length === 0) {
    return null;
  }
  let best = null;
  let bestM = 0;
  for (const f of files) {
    const st = await stat(f);
    if (st.mtimeMs >= bestM) {
      bestM = st.mtimeMs;
      best = f;
    }
  }
  return best;
}

/**
 * @param {string} p
 * @returns {Promise<{ path: string, pass: boolean, payload: unknown }>}
 */
async function loadPassingJson(p, label) {
  let payload;
  try {
    payload = JSON.parse(await readFile(p, "utf8"));
  } catch (e) {
    throw new Error(`${label}_unreadable:${String(e?.message ?? e)}`);
  }
  const pass = payload && typeof payload === "object" && payload.pass === true;
  return { path: p, pass, payload };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opts.evidenceDir || path.join(ROOT, "evidence"));
  await access(evidenceDir).catch(() => {
    throw new Error(`evidence dir missing: ${evidenceDir}`);
  });

  const failures = [];

  const h9Path = await newestMatchingFile(evidenceDir, (n) => n.startsWith("h9-closeout-") && n.endsWith(".json"));
  if (!h9Path) {
    failures.push("missing_h9_closeout_manifest");
  }

  const regressionPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("regression-eve-primary-") && n.endsWith(".json"),
  );
  if (!regressionPath) {
    failures.push("missing_regression_eve_primary_manifest");
  }

  const cutoverPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("cutover-readiness-") && n.endsWith(".json"),
  );
  if (!cutoverPath) {
    failures.push("missing_cutover_readiness_manifest");
  }

  const validationSummaryPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validation-summary-") && n.endsWith(".json"),
  );
  if (!validationSummaryPath) {
    failures.push("missing_validation_summary");
  }
  let sloGatesPassed = false;
  if (validationSummaryPath) {
    try {
      const vs = JSON.parse(await readFile(validationSummaryPath, "utf8"));
      sloGatesPassed = vs?.sloPosture?.gatesPassed === true;
      if (!sloGatesPassed) {
        failures.push("validation_summary_sloPosture_gates_not_passed");
      }
    } catch (e) {
      failures.push(`validation_summary_unreadable:${String(e?.message ?? e)}`);
    }
  }

  let h9 = null;
  if (h9Path) {
    h9 = await loadPassingJson(h9Path, "h9_closeout");
    if (!h9.pass) {
      failures.push("h9_closeout_pass_false");
    }
  }

  let regression = null;
  if (regressionPath) {
    regression = await loadPassingJson(regressionPath, "regression_eve");
    if (!regression.pass) {
      failures.push("regression_eve_primary_pass_false");
    }
  }

  let cutover = null;
  if (cutoverPath) {
    cutover = await loadPassingJson(cutoverPath, "cutover_readiness");
    if (!cutover.pass) {
      failures.push("cutover_readiness_pass_false");
    }
  }

  const gatesPassed = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `validate-all-chain-posture-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAtIso: new Date().toISOString(),
    horizonProgram: "H9",
    gatesPassed,
    files: {
      evidenceDir,
      validationSummaryPath,
      h9CloseoutPath: h9Path,
      regressionEvePrimaryPath: regressionPath,
      cutoverReadinessPath: cutoverPath,
      outPath,
    },
    checks: {
      validationSummaryPresent: Boolean(validationSummaryPath),
      validationSummarySloPostureGatesPassed: sloGatesPassed,
      h9CloseoutPresent: Boolean(h9Path),
      h9CloseoutPass: h9?.pass === true,
      regressionEvePrimaryPresent: Boolean(regressionPath),
      regressionEvePrimaryPass: regression?.pass === true,
      cutoverReadinessPresent: Boolean(cutoverPath),
      cutoverReadinessPass: cutover?.pass === true,
    },
    upstream: {
      h9Closeout: h9 ? { path: h9.path, pass: h9.pass } : null,
      regressionEvePrimary: regression ? { path: regression.path, pass: regression.pass } : null,
      cutoverReadiness: cutover ? { path: cutover.path, pass: cutover.pass } : null,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: gatesPassed, outPath, failureCount: failures.length })}\n`);
  if (!gatesPassed) {
    process.stderr.write(`validate-all chain posture failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
