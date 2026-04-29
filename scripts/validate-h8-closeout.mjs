#!/usr/bin/env node
/**
 * H8 closeout gate: wraps the latest H7 evidence-bundle manifest
 * (`h7-closeout-evidence-*.json` from `npm run validate:h7-evidence-bundle`) and requires
 * the newest `validation-summary-*.json` to include passing `sloPosture` (h8-slo-posture-v1).
 * Emits `h8-closeout-*.json` for operators pinning `promote:horizon` H7→H8 with
 * `--closeout-file` alongside `H7->H8` goal policy checks in docs/GOAL_POLICIES.json.
 */
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { evidenceDir: "", horizonStatusFile: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir" && argv[i + 1]) {
      opts.evidenceDir = argv[i + 1];
      i += 1;
    } else if (a === "--horizon-status-file" && argv[i + 1]) {
      opts.horizonStatusFile = argv[i + 1];
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
 * @param {unknown} sp
 * @returns {string[]}
 */
function validateSloPosture(sp) {
  const failures = [];
  if (!sp || typeof sp !== "object") {
    failures.push("validation_summary_missing_sloPosture");
    return failures;
  }
  const o = /** @type {Record<string, unknown>} */ (sp);
  if (o.schemaVersion !== "h8-slo-posture-v1") {
    failures.push(`slo_posture_schema_version:${String(o.schemaVersion)}`);
  }
  if (typeof o.generatedAtIso !== "string" || !o.generatedAtIso.trim()) {
    failures.push("slo_posture_missing_generatedAtIso");
  }
  if (o.gatesPassed !== true) {
    failures.push("slo_posture_gatesPassed_false");
  }
  const m = o.metrics;
  if (!m || typeof m !== "object") {
    failures.push("slo_posture_missing_metrics");
  } else {
    const metrics = /** @type {Record<string, unknown>} */ (m);
    if (typeof metrics.successRate !== "number" || Number.isNaN(metrics.successRate)) {
      failures.push("slo_posture_metrics_successRate_invalid");
    }
    if (typeof metrics.missingTraceRate !== "number" || Number.isNaN(metrics.missingTraceRate)) {
      failures.push("slo_posture_metrics_missingTraceRate_invalid");
    }
  }
  const eg = o.evidenceGates;
  if (!eg || typeof eg !== "object") {
    failures.push("slo_posture_missing_evidenceGates");
  }
  const hp = o.horizonProgram;
  if (hp !== "H8" && hp !== "H9" && hp !== "H10" && hp !== "H11") {
    failures.push(`slo_posture_horizonProgram_not_eligible_for_h8_closeout:${String(hp)}`);
  }
  return failures;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opts.evidenceDir || path.join(ROOT, "evidence"));
  const horizonStatusFile = path.resolve(opts.horizonStatusFile || path.join(ROOT, "docs/HORIZON_STATUS.json"));
  await access(evidenceDir).catch(() => {
    throw new Error(`evidence dir missing: ${evidenceDir}`);
  });

  const failures = [];
  const h7Path = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h7-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h7Path) {
    failures.push("missing_h7_evidence_closeout_manifest");
  }

  let h7Payload = null;
  if (h7Path) {
    try {
      h7Payload = JSON.parse(await readFile(h7Path, "utf8"));
    } catch (e) {
      failures.push(`h7_closeout_evidence_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h7Payload && typeof h7Payload === "object") {
    if (h7Payload.pass !== true) {
      failures.push("h7_evidence_bundle_pass_false");
    }
    if (h7Payload.checks?.horizonCloseoutGatePass !== true) {
      failures.push("h7_evidence_bundle_horizonCloseoutGatePass_false");
    }
    if (h7Payload.closeout?.horizon !== undefined && h7Payload.closeout?.horizon !== "H7") {
      failures.push(`h7_closeout_evidence_unexpected_horizon:${String(h7Payload.closeout?.horizon)}`);
    }
  }

  const validationSummaryPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validation-summary-") && n.endsWith(".json"),
  );
  let validationPayload = null;
  if (!validationSummaryPath) {
    failures.push("missing_validation_summary_for_slo_posture");
  } else {
    try {
      validationPayload = JSON.parse(await readFile(validationSummaryPath, "utf8"));
    } catch (e) {
      failures.push(`validation_summary_unreadable:${String(e?.message ?? e)}`);
    }
  }
  const sloFailures = validateSloPosture(validationPayload?.sloPosture);
  failures.push(...sloFailures);

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h8-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    schemaVersion: "h8-closeout-v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H7",
      nextHorizon: "H8",
      canCloseHorizon: pass,
      canStartNextHorizon: pass,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h7EvidenceCloseoutPath: h7Path,
      validationSummaryPath,
      outPath,
    },
    checks: {
      h8HorizonCloseoutGatePass: pass,
      horizonCloseoutGatePass: pass,
      h7EvidenceBundlePresent: Boolean(h7Path),
      h7EvidenceBundlePass: h7Payload?.pass === true,
      h7HorizonCloseoutGatePass: h7Payload?.checks?.horizonCloseoutGatePass === true,
      validationSummaryPresent: Boolean(validationSummaryPath),
      sloPosturePresent: Boolean(validationPayload?.sloPosture),
      sloPostureGatesPassed: validationPayload?.sloPosture?.gatesPassed === true,
    },
    upstream: h7Payload
      ? {
          path: h7Path,
          pass: h7Payload.pass,
          checks: h7Payload.checks ?? null,
          failures: Array.isArray(h7Payload.failures) ? h7Payload.failures : [],
        }
      : null,
    notes: {
      goalPolicyTransition: "H7->H8",
      goalPolicySources: ["docs/GOAL_POLICIES.json", "docs/HORIZON_STATUS.json goalPolicies"],
      promoteHorizonCloseoutFile:
        "Pin the newest h8-closeout-*.json from npm run validate:h8-closeout (or the underlying h7-closeout-evidence-*.json) on npm run promote:horizon -- --horizon H7 --next-horizon H8 --closeout-file <path> --goal-policy-key H7->H8; add --strict-goal-policy-gates when policy matrix must pass.",
    },
    failures,
  };

  const schema = validateManifestSchema("horizon-closeout", manifest);
  if (!schema.valid) {
    const schemaFailures = schema.errors.map((e) => `closeout_manifest_schema:${e}`);
    manifest = {
      ...manifest,
      pass: false,
      closeout: { ...manifest.closeout, canCloseHorizon: false },
      checks: { ...manifest.checks, h8HorizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`);
  if (!manifest.pass) {
    process.stderr.write(`H8 closeout validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
