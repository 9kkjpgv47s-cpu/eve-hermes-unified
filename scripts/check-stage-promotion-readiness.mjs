#!/usr/bin/env node
import { access, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";

const VALID_STAGES = ["shadow", "canary", "majority", "full"];
const HORIZON_STAGE_MAP = {
  H1: "shadow",
  H2: "canary",
  H3: "majority",
  H4: "full",
  H5: "full",
};
const STAGE_ORDER = new Map(
  VALID_STAGES.map((stage, index) => [stage, index]),
);

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    targetStage: "",
    currentStage: "",
    horizonStatusFile: "",
    out: "",
    allowHorizonMismatch: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--target-stage") {
      options.targetStage = value ?? "";
      index += 1;
    } else if (arg === "--current-stage") {
      options.currentStage = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--allow-horizon-mismatch" || arg === "--ignore-horizon-target") {
      options.allowHorizonMismatch = true;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStage(value, fallback = "") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (VALID_STAGES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function matchesArtifactPattern(pattern, targetPath) {
  const normalizedPattern = String(pattern ?? "").trim();
  const normalizedTarget = String(targetPath ?? "").trim();
  if (!normalizedPattern || !normalizedTarget) {
    return false;
  }
  const segments = normalizedPattern.split("*");
  const escapedSegments = segments.map((segment) =>
    segment.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"),
  );
  const regexSource = `^${escapedSegments.join(".*")}$`;
  return new RegExp(regexSource).test(normalizedTarget);
}

async function exists(targetPath) {
  if (!isNonEmptyString(targetPath)) {
    return false;
  }
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(targetPath) {
  const raw = await readFile(targetPath, "utf8");
  return JSON.parse(raw);
}

async function newestFileInDir(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name))
    .sort();
  return matches.length > 0 ? matches[matches.length - 1] : "";
}

async function pickLatestEvidencePaths(evidenceDir) {
  return {
    validationSummaryPath: await newestFileInDir(evidenceDir, "validation-summary-"),
    cutoverReadinessPath: await newestFileInDir(evidenceDir, "cutover-readiness-"),
    releaseReadinessPath: await newestFileInDir(evidenceDir, "release-readiness-"),
    mergeBundleValidationPath: await newestFileInDir(evidenceDir, "merge-bundle-validation-"),
    bundleVerificationPath: await newestFileInDir(evidenceDir, "bundle-verification-"),
  };
}

function stageTransitionAllowed(currentStage, targetStage) {
  const currentIndex = STAGE_ORDER.get(currentStage);
  const targetIndex = STAGE_ORDER.get(targetStage);
  if (typeof currentIndex !== "number" || typeof targetIndex !== "number") {
    return false;
  }
  return targetIndex === currentIndex || targetIndex === currentIndex + 1;
}

function evaluatePolicyGates(targetStage, metrics) {
  const failures = [];
  if (targetStage === "canary" || targetStage === "majority" || targetStage === "full") {
    if (metrics.successRate < 0.99) {
      failures.push(`success_rate_below_gate:${metrics.successRate}`);
    }
    if (metrics.missingTraceRate > 0) {
      failures.push(`missing_trace_rate_above_gate:${metrics.missingTraceRate}`);
    }
    if (metrics.unclassifiedFailures > 0) {
      failures.push(`unclassified_failures_above_gate:${metrics.unclassifiedFailures}`);
    }
  }
  if (targetStage === "majority" || targetStage === "full") {
    if (metrics.failureScenarioPassCount < 5) {
      failures.push(`failure_scenarios_below_gate:${metrics.failureScenarioPassCount}`);
    }
  }
  return failures;
}

function latestPathMatchesPattern(pattern, targetPath) {
  if (!isNonEmptyString(pattern) || !isNonEmptyString(targetPath)) {
    return false;
  }
  const normalizedPattern = String(pattern).replace(/\\/g, "/");
  const absoluteTarget = path.resolve(targetPath);
  const normalizedAbsolute = absoluteTarget.replace(/\\/g, "/");
  const patternAnchorIndex = normalizedPattern.indexOf("/");
  const patternAnchor =
    patternAnchorIndex >= 0 ? normalizedPattern.slice(0, patternAnchorIndex) : normalizedPattern;
  const anchorIndexInAbsolute = normalizedAbsolute.indexOf(`/${patternAnchor}/`);
  const anchoredRelative =
    anchorIndexInAbsolute >= 0
      ? normalizedAbsolute.slice(anchorIndexInAbsolute + 1)
      : normalizedAbsolute;
  const normalizedAbsoluteWithoutLeading = normalizedAbsolute.replace(/^\/+/, "");
  return (
    matchesArtifactPattern(normalizedPattern, normalizedAbsolute) ||
    matchesArtifactPattern(normalizedPattern, anchoredRelative) ||
    matchesArtifactPattern(normalizedPattern, normalizedAbsoluteWithoutLeading)
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir =
    path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const targetStage = normalizeStage(options.targetStage);
  const currentStage = normalizeStage(options.currentStage, "shadow");
  const allowHorizonMismatch = options.allowHorizonMismatch === true;
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`),
  );

  const failures = [];
  if (!VALID_STAGES.includes(targetStage)) {
    failures.push(`invalid_target_stage:${options.targetStage || "<empty>"}`);
  }
  if (!VALID_STAGES.includes(currentStage)) {
    failures.push(`invalid_current_stage:${options.currentStage || "<empty>"}`);
  }
  if (
    VALID_STAGES.includes(targetStage) &&
    VALID_STAGES.includes(currentStage) &&
    !stageTransitionAllowed(currentStage, targetStage)
  ) {
    failures.push(`non_sequential_stage_transition:${currentStage}->${targetStage}`);
  }

  const evidencePaths = await pickLatestEvidencePaths(evidenceDir);
  const missingEvidence = [];
  for (const [key, value] of Object.entries(evidencePaths)) {
    if (!(await exists(value))) {
      missingEvidence.push(key);
      failures.push(`missing_evidence:${key}`);
    }
  }

  let validationSummary = null;
  let cutoverReadiness = null;
  let releaseReadiness = null;
  let mergeBundleValidation = null;
  let bundleVerification = null;
  let horizonStatus = null;
  let horizonValidation = { valid: false, errors: ["horizon_status_not_loaded"] };

  if (await exists(evidencePaths.validationSummaryPath)) {
    validationSummary = await readJson(evidencePaths.validationSummaryPath);
    if (!validationSummary?.gates?.passed) {
      failures.push("validation_summary_gate_failed");
    }
  }
  if (await exists(evidencePaths.cutoverReadinessPath)) {
    cutoverReadiness = await readJson(evidencePaths.cutoverReadinessPath);
    if (!cutoverReadiness?.pass) {
      failures.push("cutover_readiness_failed");
    }
  }
  if (await exists(evidencePaths.releaseReadinessPath)) {
    releaseReadiness = await readJson(evidencePaths.releaseReadinessPath);
    if (!releaseReadiness?.pass) {
      failures.push("release_readiness_failed");
    }
    const releaseSchema = validateManifestSchema("release-readiness", releaseReadiness);
    if (!releaseSchema.valid) {
      failures.push(
        ...releaseSchema.errors.map((error) => `release_schema_invalid:${error}`),
      );
    }
  }
  if (await exists(evidencePaths.mergeBundleValidationPath)) {
    mergeBundleValidation = await readJson(evidencePaths.mergeBundleValidationPath);
    if (!mergeBundleValidation?.pass) {
      failures.push("merge_bundle_validation_failed");
    }
    const mergeValidationSchema = validateManifestSchema(
      "merge-bundle-validation",
      mergeBundleValidation,
    );
    if (!mergeValidationSchema.valid) {
      failures.push(
        ...mergeValidationSchema.errors.map((error) => `merge_bundle_validation_schema_invalid:${error}`),
      );
    }
  }
  if (await exists(evidencePaths.bundleVerificationPath)) {
    bundleVerification = await readJson(evidencePaths.bundleVerificationPath);
    if (!bundleVerification?.pass) {
      failures.push("bundle_verification_failed");
    }
  }
  if (await exists(horizonStatusFile)) {
    horizonStatus = await readJson(horizonStatusFile);
    horizonValidation = validateHorizonStatus(horizonStatus);
    if (!horizonValidation.valid) {
      failures.push(
        ...horizonValidation.errors.map((error) => `horizon_status_invalid:${error}`),
      );
    }
    const horizonExpectedStage = HORIZON_STAGE_MAP[horizonStatus?.activeHorizon] ?? "";
    if (
      !allowHorizonMismatch &&
      isNonEmptyString(horizonExpectedStage) &&
      VALID_STAGES.includes(targetStage) &&
      STAGE_ORDER.get(targetStage) < STAGE_ORDER.get(horizonExpectedStage)
    ) {
      failures.push(
        `target_stage_precedes_active_horizon:${targetStage}<${horizonExpectedStage}`,
      );
    }
    const expectedEvidence = {
      "npm run validate:evidence-summary": evidencePaths.validationSummaryPath,
      "npm run validate:cutover-readiness": evidencePaths.cutoverReadinessPath,
      "npm run validate:release-readiness": evidencePaths.releaseReadinessPath,
      "npm run validate:merge-bundle": evidencePaths.mergeBundleValidationPath,
      "npm run verify:merge-bundle": evidencePaths.bundleVerificationPath,
    };
    if (Array.isArray(horizonStatus.requiredEvidence)) {
      for (const evidenceItem of horizonStatus.requiredEvidence) {
        if (!evidenceItem || typeof evidenceItem !== "object" || evidenceItem.required !== true) {
          continue;
        }
        const commandName = String(evidenceItem.command ?? "");
        const expectedPath = expectedEvidence[commandName];
        if (!isNonEmptyString(expectedPath)) {
          continue;
        }
        if (!latestPathMatchesPattern(evidenceItem.artifactPattern, expectedPath)) {
          failures.push(`missing_artifact_pattern_match:${commandName}`);
        }
      }
    }
    const promotion = horizonStatus.promotionReadiness;
    if (promotion && typeof promotion === "object") {
      const promotionTarget = normalizeStage(promotion.targetStage);
      if (VALID_STAGES.includes(promotionTarget) && VALID_STAGES.includes(targetStage)) {
        if (!allowHorizonMismatch && promotionTarget !== targetStage) {
          failures.push("target_stage_mismatch");
        }
      }
      const promotionGates = promotion.gates && typeof promotion.gates === "object"
        ? promotion.gates
        : {};
      if (promotionGates.releaseReadinessPass === true && !releaseReadiness?.pass) {
        failures.push("promotion_gate_release_readiness_not_met");
      }
      if (promotionGates.mergeBundlePass === true && !mergeBundleValidation?.pass) {
        failures.push("promotion_gate_merge_bundle_not_met");
      }
      if (promotionGates.bundleVerificationPass === true && !bundleVerification?.pass) {
        failures.push("promotion_gate_bundle_verification_not_met");
      }
      if (promotionGates.cutoverReadinessPass === true && !cutoverReadiness?.pass) {
        failures.push("promotion_gate_cutover_readiness_not_met");
      }
      if (promotionGates.evidenceSummaryPass === true && !validationSummary?.gates?.passed) {
        failures.push("promotion_gate_evidence_summary_not_met");
      }
    }
  } else {
    failures.push("missing_horizon_status_file");
  }

  const metrics = {
    successRate: Number(validationSummary?.metrics?.successRate ?? 0),
    missingTraceRate: Number(validationSummary?.metrics?.missingTraceRate ?? 1),
    unclassifiedFailures: Number(validationSummary?.metrics?.unclassifiedFailures ?? 1),
    failureScenarioPassCount: Number(validationSummary?.metrics?.failureScenarioPassCount ?? 0),
  };
  if (VALID_STAGES.includes(targetStage)) {
    failures.push(...evaluatePolicyGates(targetStage, metrics));
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    stage: {
      current: currentStage || null,
      target: targetStage || null,
      transitionAllowed:
        VALID_STAGES.includes(currentStage) &&
        VALID_STAGES.includes(targetStage) &&
        stageTransitionAllowed(currentStage, targetStage),
    },
    files: {
      evidenceDir,
      horizonStatusFile: await exists(horizonStatusFile) ? horizonStatusFile : null,
      validationSummary: evidencePaths.validationSummaryPath || null,
      cutoverReadiness: evidencePaths.cutoverReadinessPath || null,
      releaseReadiness: evidencePaths.releaseReadinessPath || null,
      mergeBundleValidation: evidencePaths.mergeBundleValidationPath || null,
      bundleVerification: evidencePaths.bundleVerificationPath || null,
      outPath,
    },
    checks: {
      missingEvidence,
      metrics,
      validationSummaryPassed: Boolean(validationSummary?.gates?.passed),
      cutoverReadinessPassed: Boolean(cutoverReadiness?.pass),
      releaseReadinessPassed: Boolean(releaseReadiness?.pass),
      mergeBundleValidationPassed: Boolean(mergeBundleValidation?.pass),
      bundleVerificationPassed: Boolean(bundleVerification?.pass),
      horizonValidationPass: horizonValidation.valid,
      allowHorizonMismatch,
      activeHorizon: horizonStatus?.activeHorizon ?? null,
      activeStatus: horizonStatus?.activeStatus ?? null,
      stage: targetStage || null,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Stage promotion readiness failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
