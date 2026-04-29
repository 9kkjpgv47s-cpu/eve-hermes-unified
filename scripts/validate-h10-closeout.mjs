#!/usr/bin/env node
/**
 * H10 closeout gate (h9-action-3): wraps the latest H9 evidence-bundle manifest
 * (`h9-closeout-evidence-*.json` from `npm run validate:h9-evidence-bundle`) and requires
 * the newest `validate-all-chain-posture-*.json` with passing gates (h9-validate-all-chain-v1).
 * Emits `h10-closeout-*.json` for operators pinning `promote:horizon` H9→H10 with
 * `--closeout-file` alongside `H9->H10` goal policy checks in docs/GOAL_POLICIES.json.
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
function validateChainPosture(chain) {
  const failures = [];
  if (!chain || typeof chain !== "object") {
    failures.push("missing_validate_all_chain_posture");
    return failures;
  }
  const o = /** @type {Record<string, unknown>} */ (chain);
  if (o.schemaVersion !== "h9-validate-all-chain-v1") {
    failures.push(`chain_posture_schema_version:${String(o.schemaVersion)}`);
  }
  if (o.gatesPassed !== true) {
    failures.push("validate_all_chain_posture_gatesPassed_false");
  }
  if (o.horizonProgram !== "H10") {
    failures.push(`chain_posture_horizonProgram_expected_H10:${String(o.horizonProgram)}`);
  }
  return failures;
}

/**
 * @param {unknown} vs
 * @returns {string[]}
 */
function validateValidationSummarySloForH10(vs) {
  const failures = [];
  if (!vs || typeof vs !== "object") {
    failures.push("validation_summary_missing_for_h10_slo");
    return failures;
  }
  const sp = /** @type {Record<string, unknown>} */ (vs).sloPosture;
  if (!sp || typeof sp !== "object") {
    failures.push("validation_summary_missing_sloPosture_h10");
    return failures;
  }
  const o = /** @type {Record<string, unknown>} */ (sp);
  if (o.schemaVersion !== "h8-slo-posture-v1") {
    failures.push(`h10_slo_posture_schema_version:${String(o.schemaVersion)}`);
  }
  if (o.gatesPassed !== true) {
    failures.push("h10_slo_posture_gatesPassed_false");
  }
  if (o.horizonProgram !== "H10") {
    failures.push(`h10_slo_posture_horizonProgram_expected_H10:${String(o.horizonProgram)}`);
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
  const h9Path = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h9-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h9Path) {
    failures.push("missing_h9_evidence_closeout_manifest");
  }

  let h9Payload = null;
  if (h9Path) {
    try {
      h9Payload = JSON.parse(await readFile(h9Path, "utf8"));
    } catch (e) {
      failures.push(`h9_closeout_evidence_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h9Payload && typeof h9Payload === "object") {
    if (h9Payload.pass !== true) {
      failures.push("h9_evidence_bundle_pass_false");
    }
    if (h9Payload.checks?.horizonCloseoutGatePass !== true) {
      failures.push("h9_evidence_bundle_horizonCloseoutGatePass_false");
    }
    if (h9Payload.closeout?.horizon !== undefined && h9Payload.closeout?.horizon !== "H9") {
      failures.push(`h9_closeout_evidence_unexpected_horizon:${String(h9Payload.closeout?.horizon)}`);
    }
  }

  const validationSummaryPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validation-summary-") && n.endsWith(".json"),
  );
  let validationPayload = null;
  if (!validationSummaryPath) {
    failures.push("missing_validation_summary_for_h10_closeout");
  } else {
    try {
      validationPayload = JSON.parse(await readFile(validationSummaryPath, "utf8"));
    } catch (e) {
      failures.push(`validation_summary_unreadable:${String(e?.message ?? e)}`);
    }
  }
  failures.push(...validateValidationSummarySloForH10(validationPayload));

  const chainPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validate-all-chain-posture-") && n.endsWith(".json"),
  );
  let chainPayload = null;
  if (!chainPath) {
    failures.push("missing_validate_all_chain_posture_file");
  } else {
    try {
      chainPayload = JSON.parse(await readFile(chainPath, "utf8"));
    } catch (e) {
      failures.push(`validate_all_chain_posture_unreadable:${String(e?.message ?? e)}`);
    }
  }
  failures.push(...validateChainPosture(chainPayload));

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h10-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    schemaVersion: "h10-closeout-v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H9",
      nextHorizon: "H10",
      canCloseHorizon: pass,
      canStartNextHorizon: pass,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h9EvidenceCloseoutPath: h9Path,
      validationSummaryPath,
      validateAllChainPosturePath: chainPath,
      outPath,
    },
    checks: {
      h10HorizonCloseoutGatePass: pass,
      horizonCloseoutGatePass: pass,
      h9EvidenceBundlePresent: Boolean(h9Path),
      h9EvidenceBundlePass: h9Payload?.pass === true,
      h9HorizonCloseoutGatePass: h9Payload?.checks?.horizonCloseoutGatePass === true,
      validationSummaryPresent: Boolean(validationSummaryPath),
      sloPostureHorizonProgramH10: validationPayload?.sloPosture?.horizonProgram === "H10",
      sloPostureGatesPassed: validationPayload?.sloPosture?.gatesPassed === true,
      validateAllChainPosturePresent: Boolean(chainPath),
      validateAllChainPostureGatesPassed: chainPayload?.gatesPassed === true,
    },
    upstream: h9Payload
      ? {
          path: h9Path,
          pass: h9Payload.pass,
          checks: h9Payload.checks ?? null,
          failures: Array.isArray(h9Payload.failures) ? h9Payload.failures : [],
        }
      : null,
    chainPosture: chainPayload && typeof chainPayload === "object"
      ? {
          path: chainPath,
          schemaVersion: chainPayload.schemaVersion,
          gatesPassed: chainPayload.gatesPassed,
        }
      : null,
    notes: {
      goalPolicyTransition: "H9->H10",
      goalPolicySources: ["docs/GOAL_POLICIES.json", "docs/HORIZON_STATUS.json goalPolicies"],
      promoteHorizonCloseoutFile:
        "Pin the newest h10-closeout-*.json from npm run validate:h10-closeout on npm run promote:horizon -- --horizon H9 --next-horizon H10 --closeout-file <path> --goal-policy-key H9->H10; add --strict-goal-policy-gates when policy matrix must pass.",
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
      checks: { ...manifest.checks, h10HorizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`);
  if (!manifest.pass) {
    process.stderr.write(`H10 closeout validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
