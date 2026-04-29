#!/usr/bin/env node
/**
 * H12 closeout gate: wraps the latest H11 evidence-bundle manifest
 * (`h11-closeout-evidence-*.json` from `npm run validate:h11-evidence-bundle`) and requires
 * the newest `validate-all-chain-posture-h12-*.json` with passing gates (h9-validate-all-chain-v1)
 * and `horizonProgram: "H12"`.
 * Emits `h12-closeout-*.json` for operators pinning `promote:horizon` H11→H12 with
 * `--closeout-file` alongside `H11->H12` goal policy checks in docs/GOAL_POLICIES.json.
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
function validateChainPostureH12(chain) {
  const failures = [];
  if (!chain || typeof chain !== "object") {
    failures.push("missing_validate_all_chain_posture_h12");
    return failures;
  }
  const o = /** @type {Record<string, unknown>} */ (chain);
  if (o.schemaVersion !== "h9-validate-all-chain-v1") {
    failures.push(`chain_posture_h12_schema_version:${String(o.schemaVersion)}`);
  }
  if (o.gatesPassed !== true) {
    failures.push("validate_all_chain_posture_h12_gatesPassed_false");
  }
  if (o.horizonProgram !== "H12") {
    failures.push(`chain_posture_h12_horizonProgram_expected_H12:${String(o.horizonProgram)}`);
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
    failures.push("validation_summary_missing_for_h11_slo");
    return failures;
  }
  const sp = /** @type {Record<string, unknown>} */ (vs).sloPosture;
  if (!sp || typeof sp !== "object") {
    failures.push("validation_summary_missing_sloPosture_h11");
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
  const h11Path = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h11-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h11Path) {
    failures.push("missing_h11_evidence_closeout_manifest");
  }

  let h11Payload = null;
  if (h11Path) {
    try {
      h11Payload = JSON.parse(await readFile(h11Path, "utf8"));
    } catch (e) {
      failures.push(`h11_closeout_evidence_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h11Payload && typeof h11Payload === "object") {
    if (h11Payload.pass !== true) {
      failures.push("h11_evidence_bundle_pass_false");
    }
    if (h11Payload.checks?.horizonCloseoutGatePass !== true) {
      failures.push("h11_evidence_bundle_horizonCloseoutGatePass_false");
    }
    if (h11Payload.closeout?.horizon !== undefined && h11Payload.closeout?.horizon !== "H11") {
      failures.push(`h11_closeout_evidence_unexpected_horizon:${String(h11Payload.closeout?.horizon)}`);
    }
  }

  const validationSummaryPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validation-summary-") && n.endsWith(".json"),
  );
  let validationPayload = null;
  if (!validationSummaryPath) {
    failures.push("missing_validation_summary_for_h12_closeout");
  } else {
    try {
      validationPayload = JSON.parse(await readFile(validationSummaryPath, "utf8"));
    } catch (e) {
      failures.push(`validation_summary_unreadable:${String(e?.message ?? e)}`);
    }
  }
  failures.push(...validateValidationSummarySloForH11(validationPayload));

  const chainPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validate-all-chain-posture-h12-") && n.endsWith(".json"),
  );
  let chainPayload = null;
  if (!chainPath) {
    failures.push("missing_validate_all_chain_posture_h12_file");
  } else {
    try {
      chainPayload = JSON.parse(await readFile(chainPath, "utf8"));
    } catch (e) {
      failures.push(`validate_all_chain_posture_h12_unreadable:${String(e?.message ?? e)}`);
    }
  }
  failures.push(...validateChainPostureH12(chainPayload));

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h12-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    schemaVersion: "h12-closeout-v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H11",
      nextHorizon: "H12",
      canCloseHorizon: pass,
      canStartNextHorizon: pass,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h11EvidenceCloseoutPath: h11Path,
      validationSummaryPath,
      validateAllChainPostureH12Path: chainPath,
      outPath,
    },
    checks: {
      h12HorizonCloseoutGatePass: pass,
      horizonCloseoutGatePass: pass,
      h11EvidenceBundlePresent: Boolean(h11Path),
      h11EvidenceBundlePass: h11Payload?.pass === true,
      h11HorizonCloseoutGatePass: h11Payload?.checks?.horizonCloseoutGatePass === true,
      validationSummaryPresent: Boolean(validationSummaryPath),
      sloPostureHorizonProgramH11: validationPayload?.sloPosture?.horizonProgram === "H11",
      sloPostureGatesPassed: validationPayload?.sloPosture?.gatesPassed === true,
      validateAllChainPostureH12Present: Boolean(chainPath),
      validateAllChainPostureH12GatesPassed: chainPayload?.gatesPassed === true,
    },
    upstream: h11Payload
      ? {
          path: h11Path,
          pass: h11Payload.pass,
          checks: h11Payload.checks ?? null,
          failures: Array.isArray(h11Payload.failures) ? h11Payload.failures : [],
        }
      : null,
    chainPostureH12: chainPayload && typeof chainPayload === "object"
      ? {
          path: chainPath,
          schemaVersion: chainPayload.schemaVersion,
          gatesPassed: chainPayload.gatesPassed,
          horizonProgram: chainPayload.horizonProgram,
        }
      : null,
    notes: {
      goalPolicyTransition: "H11->H12",
      goalPolicySources: ["docs/GOAL_POLICIES.json", "docs/HORIZON_STATUS.json goalPolicies"],
      promoteHorizonCloseoutFile:
        "Pin the newest h12-closeout-*.json from npm run validate:h12-closeout on npm run promote:horizon -- --horizon H11 --next-horizon H12 --closeout-file <path> --goal-policy-key H11->H12; add --strict-goal-policy-gates when policy matrix must pass.",
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
      checks: { ...manifest.checks, h12HorizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`);
  if (!manifest.pass) {
    process.stderr.write(`H12 closeout validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
