#!/usr/bin/env node
import { access, readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";

const VALID_STAGES = ["shadow", "canary", "majority", "full"];
const EVIDENCE_SELECTION_MODES = ["latest", "latest-passing"];
const HORIZON_STAGE_MAP = {
  H1: "shadow",
  H2: "canary",
  H3: "majority",
  H4: "full",
  H5: "full",
  H6: "full",
  H7: "full",
  H8: "full",
  H9: "full",
  H10: "full",
  H11: "full",
  H12: "full",
  H13: "full",
  H14: "full",
  H15: "full",
  H16: "full",
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
    validationSummaryFile: "",
    cutoverReadinessFile: "",
    releaseReadinessFile: "",
    mergeBundleValidationFile: "",
    bundleVerificationFile: "",
    evidenceSelection: "",
    allowHorizonMismatch: false,
    requireReleaseReadinessGoalPolicyValidation: true,
    requireReleaseReadinessGoalPolicySourceConsistency: true,
    requireBundleVerificationSelectionProof: true,
    relaxStageTransition: false,
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
    } else if (arg === "--validation-summary-file") {
      options.validationSummaryFile = value ?? "";
      index += 1;
    } else if (arg === "--cutover-readiness-file") {
      options.cutoverReadinessFile = value ?? "";
      index += 1;
    } else if (arg === "--release-readiness-file") {
      options.releaseReadinessFile = value ?? "";
      index += 1;
    } else if (arg === "--merge-bundle-validation-file") {
      options.mergeBundleValidationFile = value ?? "";
      index += 1;
    } else if (arg === "--bundle-verification-file") {
      options.bundleVerificationFile = value ?? "";
      index += 1;
    } else if (arg === "--evidence-selection" || arg === "--evidence-selection-mode") {
      options.evidenceSelection = value ?? "";
      index += 1;
    } else if (arg === "--allow-horizon-mismatch" || arg === "--ignore-horizon-target") {
      options.allowHorizonMismatch = true;
    } else if (arg === "--require-release-readiness-goal-policy-validation") {
      options.requireReleaseReadinessGoalPolicyValidation = true;
    } else if (
      arg === "--allow-missing-release-readiness-goal-policy-validation" ||
      arg === "--allow-release-readiness-goal-policy-validation-missing"
    ) {
      options.requireReleaseReadinessGoalPolicyValidation = false;
    } else if (
      arg === "--require-release-readiness-goal-policy-source-consistency" ||
      arg === "--require-release-readiness-goal-policy-source-integrity"
    ) {
      options.requireReleaseReadinessGoalPolicySourceConsistency = true;
    } else if (
      arg === "--allow-missing-release-readiness-goal-policy-source-consistency" ||
      arg === "--allow-release-readiness-goal-policy-source-consistency-missing" ||
      arg === "--allow-release-readiness-goal-policy-source-integrity-missing"
    ) {
      options.requireReleaseReadinessGoalPolicySourceConsistency = false;
    } else if (arg === "--require-bundle-verification-selection-proof") {
      options.requireBundleVerificationSelectionProof = true;
    } else if (
      arg === "--allow-missing-bundle-verification-selection-proof" ||
      arg === "--allow-bundle-verification-selection-proof-missing"
    ) {
      options.requireBundleVerificationSelectionProof = false;
    } else if (arg === "--relax-stage-transition") {
      options.relaxStageTransition = true;
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

function normalizeEvidenceSelection(value, fallback = "latest") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (EVIDENCE_SELECTION_MODES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function parseBooleanOption(value, fallback) {
  if (!isNonEmptyString(value)) {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
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

async function newestPassingFileInDir(dir, prefix, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name))
    .sort()
    .reverse();
  for (const candidate of candidates) {
    try {
      const payload = await readJson(candidate);
      if (predicate(payload)) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return candidates.length > 0 ? candidates[0] : "";
}

async function resolveEvidencePath(explicitPath, evidenceDir, prefix, evidenceSelectionMode, predicate) {
  if (isNonEmptyString(explicitPath)) {
    return path.resolve(explicitPath);
  }
  if (evidenceSelectionMode === "latest-passing") {
    return await newestPassingFileInDir(evidenceDir, prefix, predicate);
  }
  return await newestFileInDir(evidenceDir, prefix);
}

async function pickEvidencePaths(evidenceDir, options, evidenceSelectionMode) {
  return {
    validationSummaryPath: await resolveEvidencePath(
      options.validationSummaryFile,
      evidenceDir,
      "validation-summary-",
      evidenceSelectionMode,
      (payload) => payload?.gates?.passed === true,
    ),
    cutoverReadinessPath: await resolveEvidencePath(
      options.cutoverReadinessFile,
      evidenceDir,
      "cutover-readiness-",
      evidenceSelectionMode,
      (payload) => payload?.pass === true,
    ),
    releaseReadinessPath: await resolveEvidencePath(
      options.releaseReadinessFile,
      evidenceDir,
      "release-readiness-",
      evidenceSelectionMode,
      (payload) => payload?.pass === true,
    ),
    mergeBundleValidationPath: await resolveEvidencePath(
      options.mergeBundleValidationFile,
      evidenceDir,
      "merge-bundle-validation-",
      evidenceSelectionMode,
      (payload) => payload?.pass === true,
    ),
    bundleVerificationPath: await resolveEvidencePath(
      options.bundleVerificationFile,
      evidenceDir,
      "bundle-verification-",
      evidenceSelectionMode,
      (payload) => payload?.pass === true,
    ),
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

function resolveGoalPolicyValidationState(payload, checkKeys) {
  if (!payload || typeof payload !== "object") {
    return { reported: false, pass: false };
  }
  const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};
  for (const key of checkKeys) {
    const candidate = checks[key];
    if (typeof candidate === "boolean") {
      return { reported: true, pass: candidate };
    }
  }
  return { reported: false, pass: false };
}

function resolveGoalPolicySourceConsistencyState(payload, checkKeys) {
  if (!payload || typeof payload !== "object") {
    return { reported: false, pass: false };
  }
  const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};
  for (const key of checkKeys) {
    const candidate = checks[key];
    if (typeof candidate === "boolean") {
      return { reported: true, pass: candidate };
    }
  }
  return { reported: false, pass: false };
}

function resolveStagePolicySourceConsistencySignals(stagePromotionPayload) {
  const checks =
    stagePromotionPayload?.checks && typeof stagePromotionPayload.checks === "object"
      ? stagePromotionPayload.checks
      : {};
  const resolveBooleanCandidate = (keys) => {
    for (const key of keys) {
      if (checks[key] === true) {
        return true;
      }
    }
    return false;
  };
  return {
    mergeBundleReleaseSourceConsistencyReported:
      resolveBooleanCandidate([
        "mergeBundleReleaseGoalPolicySourceConsistencyReported",
        "mergeBundleGoalPolicySourceConsistencyReported",
      ]),
    mergeBundleReleaseSourceConsistencyPassed:
      resolveBooleanCandidate([
        "mergeBundleReleaseGoalPolicySourceConsistencyPassed",
        "mergeBundleGoalPolicySourceConsistencyPassed",
      ]),
    bundleVerificationReleaseSourceConsistencyReported:
      resolveBooleanCandidate([
        "bundleVerificationReleaseGoalPolicySourceConsistencyReported",
        "bundleVerificationGoalPolicySourceConsistencyReported",
      ]),
    bundleVerificationReleaseSourceConsistencyPassed:
      resolveBooleanCandidate([
        "bundleVerificationReleaseGoalPolicySourceConsistencyPassed",
        "bundleVerificationGoalPolicySourceConsistencyPassed",
      ]),
  };
}

function resolveBundleVerificationSelectionSignals(payload, selectedMergeBundleValidationPath) {
  const checks = payload?.checks && typeof payload.checks === "object" ? payload.checks : {};
  const files = payload?.files && typeof payload.files === "object" ? payload.files : {};
  const latestRequestedRaw = checks.latestRequested;
  const latestRequestedReported = typeof latestRequestedRaw === "boolean";
  const latestRequested = latestRequestedRaw === true;
  const latestAliasResolved = checks.latestAliasResolved === true;
  const latestAliasFallbackUsed = checks.latestAliasFallbackUsed === true;
  const validationManifestResolvedRaw = checks.validationManifestResolved;
  const validationManifestResolvedReported = typeof validationManifestResolvedRaw === "boolean";
  const validationManifestResolved = validationManifestResolvedRaw === true;
  const selectionSignalReported = latestRequestedReported || validationManifestResolvedReported;
  const selectionProofPassed =
    (latestRequested && (latestAliasResolved || latestAliasFallbackUsed))
    || validationManifestResolved;
  const verificationValidationManifestPath = isNonEmptyString(files.validationManifestPath)
    ? path.resolve(String(files.validationManifestPath))
    : "";
  const verificationValidationManifestPathReported = isNonEmptyString(
    verificationValidationManifestPath,
  );
  const selectedMergeBundleValidationResolved = isNonEmptyString(selectedMergeBundleValidationPath)
    ? path.resolve(selectedMergeBundleValidationPath)
    : "";
  const selectedMergeBundleValidationPathReported = isNonEmptyString(
    selectedMergeBundleValidationResolved,
  );
  const verificationValidationManifestMatchesSelectedMergeBundleValidation =
    verificationValidationManifestPathReported &&
    selectedMergeBundleValidationPathReported &&
    verificationValidationManifestPath === selectedMergeBundleValidationResolved;
  return {
    latestRequestedReported,
    latestRequested,
    latestAliasResolved,
    latestAliasFallbackUsed,
    validationManifestResolvedReported,
    validationManifestResolved,
    selectionSignalReported,
    selectionProofPassed,
    verificationValidationManifestPath: verificationValidationManifestPath || null,
    verificationValidationManifestPathReported,
    selectedMergeBundleValidationPath:
      selectedMergeBundleValidationResolved || selectedMergeBundleValidationPath || null,
    selectedMergeBundleValidationPathReported,
    verificationValidationManifestMatchesSelectedMergeBundleValidation,
  };
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
  const basenameTarget = path.basename(normalizedAbsolute);
  const evidenceRelativeTarget = `evidence/${basenameTarget}`;
  const normalizedAbsoluteWithoutLeading = normalizedAbsolute.replace(/^\/+/, "");
  return (
    matchesArtifactPattern(normalizedPattern, normalizedAbsolute) ||
    matchesArtifactPattern(normalizedPattern, anchoredRelative) ||
    matchesArtifactPattern(normalizedPattern, evidenceRelativeTarget) ||
    matchesArtifactPattern(normalizedPattern, normalizedAbsoluteWithoutLeading)
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir =
    path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const targetStage = normalizeStage(options.targetStage);
  const currentStage = normalizeStage(options.currentStage, "shadow");
  const relaxStageTransitionFromEnv =
    String(process.env.UNIFIED_RELAX_STAGE_TRANSITION ?? "").trim().toLowerCase() === "1" ||
    String(process.env.UNIFIED_RELAX_STAGE_TRANSITION ?? "").trim().toLowerCase() === "true";
  const relaxStageTransition = options.relaxStageTransition === true || relaxStageTransitionFromEnv;
  const allowHorizonMismatch = options.allowHorizonMismatch === true;
  const evidenceSelectionMode = normalizeEvidenceSelection(options.evidenceSelection, "latest");
  const requireReleaseReadinessGoalPolicyValidation = parseBooleanOption(
    process.env.UNIFIED_STAGE_PROMOTION_REQUIRE_RELEASE_GOAL_POLICY_VALIDATION,
    options.requireReleaseReadinessGoalPolicyValidation,
  );
  const requireReleaseReadinessGoalPolicySourceConsistency = parseBooleanOption(
    process.env.UNIFIED_STAGE_PROMOTION_REQUIRE_RELEASE_GOAL_POLICY_SOURCE_CONSISTENCY,
    options.requireReleaseReadinessGoalPolicySourceConsistency,
  );
  const requireBundleVerificationSelectionProof = parseBooleanOption(
    process.env.UNIFIED_STAGE_PROMOTION_REQUIRE_BUNDLE_VERIFICATION_SELECTION_PROOF,
    options.requireBundleVerificationSelectionProof,
  );
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
  if (isNonEmptyString(options.evidenceSelection) && !EVIDENCE_SELECTION_MODES.includes(evidenceSelectionMode)) {
    failures.push(`invalid_evidence_selection:${options.evidenceSelection}`);
  }
  if (
    !relaxStageTransition &&
    VALID_STAGES.includes(targetStage) &&
    VALID_STAGES.includes(currentStage) &&
    !stageTransitionAllowed(currentStage, targetStage)
  ) {
    failures.push(`non_sequential_stage_transition:${currentStage}->${targetStage}`);
  }

  const evidencePaths = await pickEvidencePaths(evidenceDir, options, evidenceSelectionMode);
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
  let releaseGoalPolicyValidationReported = false;
  let releaseGoalPolicyValidationPassed = false;
  let releaseGoalPolicySourceConsistencyReported = false;
  let releaseGoalPolicySourceConsistencyPassed = false;
  let mergeBundleReleaseGoalPolicyValidationReported = false;
  let mergeBundleReleaseGoalPolicyValidationPassed = false;
  let mergeBundleReleaseGoalPolicySourceConsistencyReported = false;
  let mergeBundleReleaseGoalPolicySourceConsistencyPassed = false;
  let mergeBundleInitialScopeGoalPolicyValidationReported = false;
  let mergeBundleInitialScopeGoalPolicyValidationPassed = false;
  let bundleVerificationReleaseGoalPolicyValidationReported = false;
  let bundleVerificationReleaseGoalPolicyValidationPassed = false;
  let bundleVerificationReleaseGoalPolicySourceConsistencyReported = false;
  let bundleVerificationReleaseGoalPolicySourceConsistencyPassed = false;
  let bundleVerificationInitialScopeGoalPolicyValidationReported = false;
  let bundleVerificationInitialScopeGoalPolicyValidationPassed = false;
  let bundleVerificationSelectionSignalReported = false;
  let bundleVerificationSelectionProofPassed = false;
  let bundleVerificationLatestRequestedReported = false;
  let bundleVerificationLatestRequested = false;
  let bundleVerificationLatestAliasResolved = false;
  let bundleVerificationLatestAliasFallbackUsed = false;
  let bundleVerificationValidationManifestResolvedReported = false;
  let bundleVerificationValidationManifestResolved = false;
  let bundleVerificationValidationManifestPath = null;
  let bundleVerificationValidationManifestPathReported = false;
  let selectedMergeBundleValidationPath = null;
  let selectedMergeBundleValidationPathReported = false;
  let bundleVerificationValidationManifestMatchesSelectedMergeBundleValidation = false;
  let bundleVerificationSelectionGateSatisfied = false;
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
    releaseGoalPolicyValidationReported =
      typeof releaseReadiness?.checks?.goalPolicyFileValidationPassed === "boolean";
    releaseGoalPolicyValidationPassed =
      releaseReadiness?.checks?.goalPolicyFileValidationPassed === true;
    const releaseGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(
      releaseReadiness,
      [
        "goalPolicySourceConsistencyPassed",
        "goalPolicySourceConsistencyPass",
      ],
    );
    releaseGoalPolicySourceConsistencyReported = releaseGoalPolicySourceConsistency.reported;
    releaseGoalPolicySourceConsistencyPassed = releaseGoalPolicySourceConsistency.pass;
    if (requireReleaseReadinessGoalPolicyValidation) {
      if (!releaseGoalPolicyValidationReported) {
        failures.push("release_goal_policy_validation_not_reported");
      } else if (!releaseGoalPolicyValidationPassed) {
        failures.push("release_goal_policy_validation_not_passed");
      }
    }
    if (requireReleaseReadinessGoalPolicySourceConsistency) {
      if (!releaseGoalPolicySourceConsistencyReported) {
        failures.push("release_goal_policy_source_consistency_not_reported");
      } else if (!releaseGoalPolicySourceConsistencyPassed) {
        failures.push("release_goal_policy_source_consistency_not_passed");
      }
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
    const mergeBundleReleaseGoalPolicyValidation = resolveGoalPolicyValidationState(
      mergeBundleValidation,
      ["releaseGoalPolicyValidationPassed"],
    );
    mergeBundleReleaseGoalPolicyValidationReported = mergeBundleReleaseGoalPolicyValidation.reported;
    mergeBundleReleaseGoalPolicyValidationPassed = mergeBundleReleaseGoalPolicyValidation.pass;
    if (!mergeBundleReleaseGoalPolicyValidationReported) {
      failures.push("merge_bundle_release_goal_policy_validation_not_reported");
    } else if (!mergeBundleReleaseGoalPolicyValidationPassed) {
      failures.push("merge_bundle_release_goal_policy_validation_not_passed");
    }
    const mergeBundleReleaseGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(
      mergeBundleValidation,
      [
        "releaseGoalPolicySourceConsistencyPassed",
        "releaseGoalPolicySourceConsistencyPass",
      ],
    );
    mergeBundleReleaseGoalPolicySourceConsistencyReported =
      mergeBundleReleaseGoalPolicySourceConsistency.reported;
    mergeBundleReleaseGoalPolicySourceConsistencyPassed =
      mergeBundleReleaseGoalPolicySourceConsistency.pass;
    if (!mergeBundleReleaseGoalPolicySourceConsistencyReported) {
      failures.push("merge_bundle_release_goal_policy_source_consistency_not_reported");
    } else if (!mergeBundleReleaseGoalPolicySourceConsistencyPassed) {
      failures.push("merge_bundle_release_goal_policy_source_consistency_not_passed");
    }
    const mergeBundleInitialScopeGoalPolicyValidation = resolveGoalPolicyValidationState(
      mergeBundleValidation,
      ["initialScopeGoalPolicyValidationPassed"],
    );
    mergeBundleInitialScopeGoalPolicyValidationReported =
      mergeBundleInitialScopeGoalPolicyValidation.reported;
    mergeBundleInitialScopeGoalPolicyValidationPassed =
      mergeBundleInitialScopeGoalPolicyValidation.pass;
    if (!mergeBundleInitialScopeGoalPolicyValidationReported) {
      failures.push("merge_bundle_initial_scope_goal_policy_validation_not_reported");
    } else if (!mergeBundleInitialScopeGoalPolicyValidationPassed) {
      failures.push("merge_bundle_initial_scope_goal_policy_validation_not_passed");
    }
  }
  if (await exists(evidencePaths.bundleVerificationPath)) {
    bundleVerification = await readJson(evidencePaths.bundleVerificationPath);
    if (!bundleVerification?.pass) {
      failures.push("bundle_verification_failed");
    }
    const bundleVerificationReleaseGoalPolicyValidation = resolveGoalPolicyValidationState(
      bundleVerification,
      ["releaseGoalPolicyValidationPassed"],
    );
    bundleVerificationReleaseGoalPolicyValidationReported =
      bundleVerificationReleaseGoalPolicyValidation.reported;
    bundleVerificationReleaseGoalPolicyValidationPassed =
      bundleVerificationReleaseGoalPolicyValidation.pass;
    if (!bundleVerificationReleaseGoalPolicyValidationReported) {
      failures.push("bundle_verify_release_goal_policy_validation_not_reported");
    } else if (!bundleVerificationReleaseGoalPolicyValidationPassed) {
      failures.push("bundle_verify_release_goal_policy_validation_not_passed");
    }
    const bundleVerificationReleaseGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(
      bundleVerification,
      [
        "releaseGoalPolicySourceConsistencyPassed",
        "releaseGoalPolicySourceConsistencyPass",
      ],
    );
    bundleVerificationReleaseGoalPolicySourceConsistencyReported =
      bundleVerificationReleaseGoalPolicySourceConsistency.reported;
    bundleVerificationReleaseGoalPolicySourceConsistencyPassed =
      bundleVerificationReleaseGoalPolicySourceConsistency.pass;
    if (!bundleVerificationReleaseGoalPolicySourceConsistencyReported) {
      failures.push("bundle_verify_release_goal_policy_source_consistency_not_reported");
    } else if (!bundleVerificationReleaseGoalPolicySourceConsistencyPassed) {
      failures.push("bundle_verify_release_goal_policy_source_consistency_not_passed");
    }
    const bundleVerificationInitialScopeGoalPolicyValidation = resolveGoalPolicyValidationState(
      bundleVerification,
      ["initialScopeGoalPolicyValidationPassed"],
    );
    bundleVerificationInitialScopeGoalPolicyValidationReported =
      bundleVerificationInitialScopeGoalPolicyValidation.reported;
    bundleVerificationInitialScopeGoalPolicyValidationPassed =
      bundleVerificationInitialScopeGoalPolicyValidation.pass;
    if (!bundleVerificationInitialScopeGoalPolicyValidationReported) {
      failures.push("bundle_verify_initial_scope_goal_policy_validation_not_reported");
    } else if (!bundleVerificationInitialScopeGoalPolicyValidationPassed) {
      failures.push("bundle_verify_initial_scope_goal_policy_validation_not_passed");
    }
    const bundleVerificationSelectionSignals = resolveBundleVerificationSelectionSignals(
      bundleVerification,
      evidencePaths.mergeBundleValidationPath,
    );
    bundleVerificationSelectionSignalReported =
      bundleVerificationSelectionSignals.selectionSignalReported;
    bundleVerificationSelectionProofPassed =
      bundleVerificationSelectionSignals.selectionProofPassed;
    bundleVerificationLatestRequestedReported =
      bundleVerificationSelectionSignals.latestRequestedReported;
    bundleVerificationLatestRequested = bundleVerificationSelectionSignals.latestRequested;
    bundleVerificationLatestAliasResolved =
      bundleVerificationSelectionSignals.latestAliasResolved;
    bundleVerificationLatestAliasFallbackUsed =
      bundleVerificationSelectionSignals.latestAliasFallbackUsed;
    bundleVerificationValidationManifestResolvedReported =
      bundleVerificationSelectionSignals.validationManifestResolvedReported;
    bundleVerificationValidationManifestResolved =
      bundleVerificationSelectionSignals.validationManifestResolved;
    bundleVerificationValidationManifestPath =
      bundleVerificationSelectionSignals.verificationValidationManifestPath;
    bundleVerificationValidationManifestPathReported =
      bundleVerificationSelectionSignals.verificationValidationManifestPathReported;
    selectedMergeBundleValidationPath =
      bundleVerificationSelectionSignals.selectedMergeBundleValidationPath;
    selectedMergeBundleValidationPathReported =
      bundleVerificationSelectionSignals.selectedMergeBundleValidationPathReported;
    bundleVerificationValidationManifestMatchesSelectedMergeBundleValidation =
      bundleVerificationSelectionSignals.verificationValidationManifestMatchesSelectedMergeBundleValidation;
    if (requireBundleVerificationSelectionProof) {
      if (!bundleVerificationSelectionSignalReported) {
        failures.push("bundle_verify_selection_proof_not_reported");
      } else if (!bundleVerificationSelectionProofPassed) {
        failures.push("bundle_verify_selection_proof_not_passed");
      }
      if (!bundleVerificationValidationManifestPathReported) {
        failures.push("bundle_verify_validation_manifest_path_not_reported");
      } else if (
        selectedMergeBundleValidationPathReported &&
        !bundleVerificationValidationManifestMatchesSelectedMergeBundleValidation
      ) {
        failures.push("bundle_verify_validation_manifest_path_mismatch");
      }
    }
    bundleVerificationSelectionGateSatisfied =
      !requireBundleVerificationSelectionProof ||
      (
        bundleVerificationSelectionSignalReported &&
        bundleVerificationSelectionProofPassed &&
        bundleVerificationValidationManifestPathReported &&
        (
          !selectedMergeBundleValidationPathReported ||
          bundleVerificationValidationManifestMatchesSelectedMergeBundleValidation
        )
      );
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
      if (
        promotionGates.mergeBundlePass === true &&
        !(
          mergeBundleValidation?.pass
          && mergeBundleReleaseGoalPolicyValidationPassed
          && mergeBundleReleaseGoalPolicySourceConsistencyPassed
          && mergeBundleInitialScopeGoalPolicyValidationPassed
        )
      ) {
        failures.push("promotion_gate_merge_bundle_not_met");
      }
      if (
        promotionGates.bundleVerificationPass === true &&
        !(
          bundleVerification?.pass
          && bundleVerificationReleaseGoalPolicyValidationPassed
          && bundleVerificationReleaseGoalPolicySourceConsistencyPassed
          && bundleVerificationInitialScopeGoalPolicyValidationPassed
          && bundleVerificationSelectionGateSatisfied
        )
      ) {
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
        relaxStageTransition ||
        (VALID_STAGES.includes(currentStage) &&
          VALID_STAGES.includes(targetStage) &&
          stageTransitionAllowed(currentStage, targetStage)),
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
      requireReleaseReadinessGoalPolicyValidation,
      requireReleaseReadinessGoalPolicySourceConsistency,
      requireBundleVerificationSelectionProof,
      releaseGoalPolicyValidationReported,
      releaseGoalPolicyValidationPassed,
      releaseGoalPolicySourceConsistencyReported,
      releaseGoalPolicySourceConsistencyPassed,
      mergeBundleValidationPassed: Boolean(mergeBundleValidation?.pass),
      mergeBundleReleaseGoalPolicyValidationReported,
      mergeBundleReleaseGoalPolicyValidationPassed,
      mergeBundleReleaseGoalPolicySourceConsistencyReported,
      mergeBundleReleaseGoalPolicySourceConsistencyPassed,
      mergeBundleInitialScopeGoalPolicyValidationReported,
      mergeBundleInitialScopeGoalPolicyValidationPassed,
      bundleVerificationPassed: Boolean(bundleVerification?.pass),
      bundleVerificationReleaseGoalPolicyValidationReported,
      bundleVerificationReleaseGoalPolicyValidationPassed,
      bundleVerificationReleaseGoalPolicySourceConsistencyReported,
      bundleVerificationReleaseGoalPolicySourceConsistencyPassed,
      bundleVerificationInitialScopeGoalPolicyValidationReported,
      bundleVerificationInitialScopeGoalPolicyValidationPassed,
      bundleVerificationSelectionSignalReported,
      bundleVerificationSelectionProofPassed,
      bundleVerificationLatestRequestedReported,
      bundleVerificationLatestRequested,
      bundleVerificationLatestAliasResolved,
      bundleVerificationLatestAliasFallbackUsed,
      bundleVerificationValidationManifestResolvedReported,
      bundleVerificationValidationManifestResolved,
      bundleVerificationValidationManifestPath,
      bundleVerificationValidationManifestPathReported,
      selectedMergeBundleValidationPath,
      selectedMergeBundleValidationPathReported,
      bundleVerificationValidationManifestMatchesSelectedMergeBundleValidation,
      bundleVerificationSelectionGateSatisfied,
      horizonValidationPass: horizonValidation.valid,
      allowHorizonMismatch,
      relaxStageTransition,
      evidenceSelectionMode,
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
