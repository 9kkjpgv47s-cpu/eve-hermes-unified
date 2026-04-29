#!/usr/bin/env node
/**
 * H11 closeout gate: wraps the latest H10 evidence-bundle manifest
 * (`h10-closeout-evidence-*.json` from `npm run validate:h10-evidence-bundle`) and requires
 * the newest `validation-summary-*.json` with passing `sloPosture` (`horizonProgram: "H11"`)
 * and the newest `validate-all-chain-posture-h11-*.json` with passing gates (h9-validate-all-chain-v1)
 * and `horizonProgram: "H11"`.
 * Emits `h11-closeout-*.json` for operators pinning `promote:horizon` H10→H11 with
 * `--closeout-file` alongside `H10->H11` goal policy checks in docs/GOAL_POLICIES.json.
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
 * @param {unknown} chain
 * @returns {string[]}
 */
function validateChainPostureH11(chain) {
  const failures = [];
  if (!chain || typeof chain !== "object") {
    failures.push("missing_validate_all_chain_posture_h11");
    return failures;
  }
  const o = /** @type {Record<string, unknown>} */ (chain);
  if (o.schemaVersion !== "h9-validate-all-chain-v1") {
    failures.push(`chain_posture_h11_schema_version:${String(o.schemaVersion)}`);
  }
  if (o.gatesPassed !== true) {
    failures.push("validate_all_chain_posture_h11_gatesPassed_false");
  }
  if (o.horizonProgram !== "H11") {
    failures.push(`chain_posture_h11_horizonProgram_expected_H11:${String(o.horizonProgram)}`);
  }
  return failures;
}

/**
 * @param {unknown} vs
 * @returns {string[]}
 */
function validateValidationSummarySloForH11(vs) {
  const failures = [];
  if (!vs || typeof vs !== "object") {
    failures.push("validation_summary_missing_for_h11_closeout");
    return failures;
  }
  const sp = /** @type {Record<string, unknown>} */ (vs).sloPosture;
  if (!sp || typeof sp !== "object") {
    failures.push("validation_summary_missing_sloPosture_h11_closeout");
    return failures;
  }
  const o = /** @type {Record<string, unknown>} */ (sp);
  if (o.schemaVersion !== "h8-slo-posture-v1") {
    failures.push(`h11_slo_posture_schema_version:${String(o.schemaVersion)}`);
  }
  if (o.gatesPassed !== true) {
    failures.push("h11_slo_posture_gatesPassed_false");
  }
  if (o.horizonProgram !== "H11") {
    failures.push(`h11_slo_posture_horizonProgram_expected_H11:${String(o.horizonProgram)}`);
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
  const h10Path = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h10-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h10Path) {
    failures.push("missing_h10_evidence_closeout_manifest");
  }

  let h10Payload = null;
  if (h10Path) {
    try {
      h10Payload = JSON.parse(await readFile(h10Path, "utf8"));
    } catch (e) {
      failures.push(`h10_closeout_evidence_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h10Payload && typeof h10Payload === "object") {
    if (h10Payload.pass !== true) {
      failures.push("h10_evidence_bundle_pass_false");
    }
    if (h10Payload.checks?.horizonCloseoutGatePass !== true) {
      failures.push("h10_evidence_bundle_horizonCloseoutGatePass_false");
    }
    if (h10Payload.closeout?.horizon !== undefined && h10Payload.closeout?.horizon !== "H10") {
      failures.push(`h10_closeout_evidence_unexpected_horizon:${String(h10Payload.closeout?.horizon)}`);
    }
  }

  const chainPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validate-all-chain-posture-h11-") && n.endsWith(".json"),
  );
  let chainPayload = null;
  if (!chainPath) {
    failures.push("missing_validate_all_chain_posture_h11_file");
  } else {
    try {
      chainPayload = JSON.parse(await readFile(chainPath, "utf8"));
    } catch (e) {
      failures.push(`validate_all_chain_posture_h11_unreadable:${String(e?.message ?? e)}`);
    }
  }
  const validationSummaryPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validation-summary-") && n.endsWith(".json"),
  );
  let validationPayload = null;
  if (!validationSummaryPath) {
    failures.push("missing_validation_summary_for_h11_closeout");
  } else {
    try {
      validationPayload = JSON.parse(await readFile(validationSummaryPath, "utf8"));
    } catch (e) {
      failures.push(`validation_summary_unreadable:${String(e?.message ?? e)}`);
    }
  }
  failures.push(...validateValidationSummarySloForH11(validationPayload));

  failures.push(...validateChainPostureH11(chainPayload));

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h11-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    schemaVersion: "h11-closeout-v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H10",
      nextHorizon: "H11",
      canCloseHorizon: pass,
      canStartNextHorizon: pass,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h10EvidenceCloseoutPath: h10Path,
      validationSummaryPath,
      validateAllChainPostureH11Path: chainPath,
      outPath,
    },
    checks: {
      h11HorizonCloseoutGatePass: pass,
      horizonCloseoutGatePass: pass,
      h10EvidenceBundlePresent: Boolean(h10Path),
      h10EvidenceBundlePass: h10Payload?.pass === true,
      h10HorizonCloseoutGatePass: h10Payload?.checks?.horizonCloseoutGatePass === true,
      validationSummaryPresent: Boolean(validationSummaryPath),
      sloPostureHorizonProgramH11: validationPayload?.sloPosture?.horizonProgram === "H11",
      sloPostureGatesPassed: validationPayload?.sloPosture?.gatesPassed === true,
      validateAllChainPostureH11Present: Boolean(chainPath),
      validateAllChainPostureH11GatesPassed: chainPayload?.gatesPassed === true,
    },
    upstream: h10Payload
      ? {
          path: h10Path,
          pass: h10Payload.pass,
          checks: h10Payload.checks ?? null,
          failures: Array.isArray(h10Payload.failures) ? h10Payload.failures : [],
        }
      : null,
    chainPostureH11: chainPayload && typeof chainPayload === "object"
      ? {
          path: chainPath,
          schemaVersion: chainPayload.schemaVersion,
          gatesPassed: chainPayload.gatesPassed,
          horizonProgram: chainPayload.horizonProgram,
        }
      : null,
    notes: {
      goalPolicyTransition: "H10->H11",
      goalPolicySources: ["docs/GOAL_POLICIES.json", "docs/HORIZON_STATUS.json goalPolicies"],
      promoteHorizonCloseoutFile:
        "Pin the newest h11-closeout-*.json from npm run validate:h11-closeout on npm run promote:horizon -- --horizon H10 --next-horizon H11 --closeout-file <path> --goal-policy-key H10->H11; add --strict-goal-policy-gates when policy matrix must pass.",
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
      checks: { ...manifest.checks, h11HorizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`);
  if (!manifest.pass) {
    process.stderr.write(`H11 closeout validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
