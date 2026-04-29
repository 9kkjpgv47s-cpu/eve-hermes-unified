#!/usr/bin/env node
/**
 * After validate closeout(s), regression, and cutover readiness,
 * emit a single machine-readable posture proving the tail of `validate:all` passed.
 * Writes `<filePrefix>*.json` (default `validate-all-chain-posture-`, schema h9-validate-all-chain-v1).
 * `--horizon-program` stamps the manifest (H10 / H11 / H12, …).
 * `--file-prefix` sets the output filename prefix (e.g. `validate-all-chain-posture-h11-`).
 * `--promotion-closeout-prefix` selects the promotion pin (default `h9-closeout-`; use `h11-closeout-` for H12 chain).
 */
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_VERSION = "h9-validate-all-chain-v1";
const DEFAULT_PROMOTION_PREFIX = "h9-closeout-";

function parseArgs(argv) {
  const opts = {
    evidenceDir: "",
    out: "",
    horizonProgram: "H9",
    filePrefix: "validate-all-chain-posture-",
    promotionCloseoutPrefix: DEFAULT_PROMOTION_PREFIX,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir" && argv[i + 1]) {
      opts.evidenceDir = argv[i + 1];
      i += 1;
    } else if (a === "--out" && argv[i + 1]) {
      opts.out = argv[i + 1];
      i += 1;
    } else if (a === "--horizon-program" && argv[i + 1]) {
      opts.horizonProgram = argv[i + 1];
      i += 1;
    } else if (a === "--file-prefix" && argv[i + 1]) {
      opts.filePrefix = argv[i + 1];
      i += 1;
    } else if (a === "--promotion-closeout-prefix" && argv[i + 1]) {
      opts.promotionCloseoutPrefix = argv[i + 1];
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

  const horizonProgram =
    typeof opts.horizonProgram === "string" && opts.horizonProgram.trim() ? opts.horizonProgram.trim() : "H9";
  const filePrefix =
    typeof opts.filePrefix === "string" && opts.filePrefix.trim() ? opts.filePrefix.trim() : "validate-all-chain-posture-";
  const promotionPrefix =
    typeof opts.promotionCloseoutPrefix === "string" && opts.promotionCloseoutPrefix.trim()
      ? opts.promotionCloseoutPrefix.trim()
      : DEFAULT_PROMOTION_PREFIX;

  const failures = [];

  const promotionPath = await newestMatchingFile(
    evidenceDir,
    (n) =>
      n.startsWith(promotionPrefix)
      && n.endsWith(".json")
      && !n.includes("-closeout-evidence-"),
  );
  if (!promotionPath) {
    failures.push(`missing_promotion_closeout_manifest:${promotionPrefix}`);
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

  let promotion = null;
  if (promotionPath) {
    promotion = await loadPassingJson(promotionPath, "promotion_closeout");
    if (!promotion.pass) {
      failures.push("promotion_closeout_pass_false");
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
    path.join(evidenceDir, `${filePrefix}${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  const useLegacyH9Fields = promotionPrefix === DEFAULT_PROMOTION_PREFIX;

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    generatedAtIso: new Date().toISOString(),
    horizonProgram,
    gatesPassed,
    files: {
      evidenceDir,
      validationSummaryPath,
      promotionCloseoutPrefix: promotionPrefix,
      promotionCloseoutPath: promotionPath,
      ...(useLegacyH9Fields ? { h9CloseoutPath: promotionPath } : {}),
      regressionEvePrimaryPath: regressionPath,
      cutoverReadinessPath: cutoverPath,
      outPath,
    },
    checks: {
      validationSummaryPresent: Boolean(validationSummaryPath),
      validationSummarySloPostureGatesPassed: sloGatesPassed,
      promotionCloseoutPresent: Boolean(promotionPath),
      promotionCloseoutPass: promotion?.pass === true,
      ...(useLegacyH9Fields
        ? {
            h9CloseoutPresent: Boolean(promotionPath),
            h9CloseoutPass: promotion?.pass === true,
          }
        : {}),
      regressionEvePrimaryPresent: Boolean(regressionPath),
      regressionEvePrimaryPass: regression?.pass === true,
      cutoverReadinessPresent: Boolean(cutoverPath),
      cutoverReadinessPass: cutover?.pass === true,
    },
    upstream: {
      promotionCloseout: promotion ? { path: promotion.path, pass: promotion.pass } : null,
      ...(useLegacyH9Fields
        ? { h9Closeout: promotion ? { path: promotion.path, pass: promotion.pass } : null }
        : {}),
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
