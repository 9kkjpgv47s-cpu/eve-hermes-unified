#!/usr/bin/env node
/**
 * H9 closeout gate (h8-action-3): wraps the latest H8 evidence-bundle manifest
 * (`h8-closeout-evidence-*.json` from `npm run validate:h8-evidence-bundle`) and requires
 * the newest `validation-summary-*.json` to include passing `sloPosture` (h8-slo-posture-v1).
 * Emits `h9-closeout-*.json` for operators pinning `promote:horizon` H8→H9 with
 * `--closeout-file` alongside `H8->H9` goal policy checks in docs/GOAL_POLICIES.json.
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
  if (o.horizonProgram !== "H10" && o.horizonProgram !== "H11") {
    failures.push(`slo_posture_horizonProgram_expected_H10_or_H11:${String(o.horizonProgram)}`);
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
  const h8Path = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h8-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h8Path) {
    failures.push("missing_h8_evidence_closeout_manifest");
  }

  let h8Payload = null;
  if (h8Path) {
    try {
      h8Payload = JSON.parse(await readFile(h8Path, "utf8"));
    } catch (e) {
      failures.push(`h8_closeout_evidence_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h8Payload && typeof h8Payload === "object") {
    if (h8Payload.pass !== true) {
      failures.push("h8_evidence_bundle_pass_false");
    }
    if (h8Payload.checks?.horizonCloseoutGatePass !== true) {
      failures.push("h8_evidence_bundle_horizonCloseoutGatePass_false");
    }
    if (h8Payload.closeout?.horizon !== undefined && h8Payload.closeout?.horizon !== "H8") {
      failures.push(`h8_closeout_evidence_unexpected_horizon:${String(h8Payload.closeout?.horizon)}`);
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
    path.join(evidenceDir, `h9-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    schemaVersion: "h9-closeout-v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H8",
      nextHorizon: "H9",
      canCloseHorizon: pass,
      canStartNextHorizon: pass,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h8EvidenceCloseoutPath: h8Path,
      validationSummaryPath,
      outPath,
    },
    checks: {
      h9HorizonCloseoutGatePass: pass,
      horizonCloseoutGatePass: pass,
      h8EvidenceBundlePresent: Boolean(h8Path),
      h8EvidenceBundlePass: h8Payload?.pass === true,
      h8HorizonCloseoutGatePass: h8Payload?.checks?.horizonCloseoutGatePass === true,
      validationSummaryPresent: Boolean(validationSummaryPath),
      sloPosturePresent: Boolean(validationPayload?.sloPosture),
      sloPostureGatesPassed: validationPayload?.sloPosture?.gatesPassed === true,
      sloPostureHorizonProgramH10: validationPayload?.sloPosture?.horizonProgram === "H10",
    },
    upstream: h8Payload
      ? {
          path: h8Path,
          pass: h8Payload.pass,
          checks: h8Payload.checks ?? null,
          failures: Array.isArray(h8Payload.failures) ? h8Payload.failures : [],
        }
      : null,
    notes: {
      goalPolicyTransition: "H8->H9",
      goalPolicySources: ["docs/GOAL_POLICIES.json", "docs/HORIZON_STATUS.json goalPolicies"],
      promoteHorizonCloseoutFile:
        "Pin the newest h9-closeout-*.json from npm run validate:h9-closeout (or the underlying h8-closeout-evidence-*.json) on npm run promote:horizon -- --horizon H8 --next-horizon H9 --closeout-file <path> --goal-policy-key H8->H9; add --strict-goal-policy-gates when policy matrix must pass.",
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
      checks: { ...manifest.checks, h9HorizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`);
  if (!manifest.pass) {
    process.stderr.write(`H9 closeout validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
