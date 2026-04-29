#!/usr/bin/env node
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const VALID_STAGES = ["shadow", "canary", "majority", "full"];
const VALID_EVIDENCE_SELECTION_MODES = ["latest", "latest-passing"];
const DECISION_HOLD = "hold";
const DECISION_ROLLBACK = "rollback";

function parseArgs(argv) {
  const options = {
    evidenceDir: "",
    stage: "",
    envFile: "",
    out: "",
    autoApplyRollback: false,
    horizonStatusFile: "",
    minSuccessRate: Number.NaN,
    maxMissingTraceRate: Number.NaN,
    maxUnclassifiedFailures: Number.NaN,
    minFailureScenarioPassCount: Number.NaN,
    maxP95LatencyMs: Number.NaN,
    validationSummaryFile: "",
    cutoverReadinessFile: "",
    releaseReadinessFile: "",
    stagePromotionReadinessFile: "",
    evidenceSelectionMode: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--stage") {
      options.stage = value ?? "";
      index += 1;
    } else if (arg === "--env-file") {
      options.envFile = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--auto-apply-rollback") {
      options.autoApplyRollback = true;
    } else if (arg === "--min-success-rate") {
      options.minSuccessRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--max-missing-trace-rate") {
      options.maxMissingTraceRate = Number(value ?? "");
      index += 1;
    } else if (arg === "--max-unclassified-failures") {
      options.maxUnclassifiedFailures = Number(value ?? "");
      index += 1;
    } else if (arg === "--min-failure-scenario-pass-count") {
      options.minFailureScenarioPassCount = Number(value ?? "");
      index += 1;
    } else if (arg === "--max-p95-latency-ms") {
      options.maxP95LatencyMs = Number(value ?? "");
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
    } else if (arg === "--stage-promotion-readiness-file") {
      options.stagePromotionReadinessFile = value ?? "";
      index += 1;
    } else if (arg === "--evidence-selection" || arg === "--evidence-selection-mode") {
      options.evidenceSelectionMode = value ?? "";
      index += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStage(value, fallback = "") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_STAGES.includes(normalized) ? normalized : fallback;
}

function normalizeEvidenceSelection(value, fallback = "latest") {
  const normalized = String(value ?? "").trim().toLowerCase();
  return VALID_EVIDENCE_SELECTION_MODES.includes(normalized) ? normalized : fallback;
}

function toFiniteNumber(value, fallback) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function formatStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
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

async function newestPassingFileInDir(evidenceDir, prefix, predicate) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(evidenceDir, entry.name))
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

async function resolveEvidencePath({
  explicitPath,
  evidenceDir,
  prefix,
  evidenceSelectionMode,
  passingSelector,
}) {
  if (isNonEmptyString(explicitPath)) {
    return path.resolve(explicitPath);
  }
  if (evidenceSelectionMode === "latest-passing") {
    return await newestPassingFileInDir(evidenceDir, prefix, passingSelector);
  }
  return await newestFileInDir(evidenceDir, prefix);
}

function evaluateThresholds(stage, metrics, thresholds) {
  const reasons = [];
  const minSuccessRate = thresholds.minSuccessRate;
  const maxMissingTraceRate = thresholds.maxMissingTraceRate;
  const maxUnclassifiedFailures = thresholds.maxUnclassifiedFailures;
  const minFailureScenarioPassCount = thresholds.minFailureScenarioPassCount;
  const maxP95LatencyMs = thresholds.maxP95LatencyMs;

  if (metrics.successRate < minSuccessRate) {
    reasons.push(`success_rate_below_threshold:${metrics.successRate}<${minSuccessRate}`);
  }
  if (metrics.missingTraceRate > maxMissingTraceRate) {
    reasons.push(
      `missing_trace_rate_above_threshold:${metrics.missingTraceRate}>${maxMissingTraceRate}`,
    );
  }
  if (metrics.unclassifiedFailures > maxUnclassifiedFailures) {
    reasons.push(
      `unclassified_failures_above_threshold:${metrics.unclassifiedFailures}>${maxUnclassifiedFailures}`,
    );
  }
  if ((stage === "majority" || stage === "full") && metrics.failureScenarioPassCount < minFailureScenarioPassCount) {
    reasons.push(
      `failure_scenario_pass_count_below_threshold:${metrics.failureScenarioPassCount}<${minFailureScenarioPassCount}`,
    );
  }
  if (metrics.p95LatencyMs > maxP95LatencyMs) {
    reasons.push(`p95_latency_above_threshold:${metrics.p95LatencyMs}>${maxP95LatencyMs}`);
  }

  return reasons;
}

function resolveStagePromotionGoalPolicySignals(stagePromotionPayload) {
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
    mergeBundleReleaseReported: resolveBooleanCandidate([
      "mergeBundleReleaseGoalPolicyValidationReported",
      "mergeBundleGoalPolicyValidationReported",
    ]),
    mergeBundleReleasePassed: resolveBooleanCandidate([
      "mergeBundleReleaseGoalPolicyValidationPassed",
      "mergeBundleGoalPolicyValidationPassed",
    ]),
    mergeBundleReleaseSourceConsistencyReported: resolveBooleanCandidate([
      "mergeBundleReleaseGoalPolicySourceConsistencyReported",
      "mergeBundleGoalPolicySourceConsistencyReported",
    ]),
    mergeBundleReleaseSourceConsistencyPassed: resolveBooleanCandidate([
      "mergeBundleReleaseGoalPolicySourceConsistencyPassed",
      "mergeBundleGoalPolicySourceConsistencyPassed",
    ]),
    mergeBundleInitialScopeReported:
      resolveBooleanCandidate(["mergeBundleInitialScopeGoalPolicyValidationReported"]),
    mergeBundleInitialScopePassed:
      resolveBooleanCandidate(["mergeBundleInitialScopeGoalPolicyValidationPassed"]),
    bundleVerificationReleaseReported:
      resolveBooleanCandidate([
        "bundleVerificationReleaseGoalPolicyValidationReported",
        "bundleVerificationGoalPolicyValidationReported",
      ]),
    bundleVerificationReleasePassed:
      resolveBooleanCandidate([
        "bundleVerificationReleaseGoalPolicyValidationPassed",
        "bundleVerificationGoalPolicyValidationPassed",
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
    bundleVerificationInitialScopeReported:
      resolveBooleanCandidate(["bundleVerificationInitialScopeGoalPolicyValidationReported"]),
    bundleVerificationInitialScopePassed:
      resolveBooleanCandidate(["bundleVerificationInitialScopeGoalPolicyValidationPassed"]),
    bundleVerificationSelectionSignalReported:
      resolveBooleanCandidate(["bundleVerificationSelectionSignalReported"]),
    bundleVerificationSelectionProofPassed:
      resolveBooleanCandidate(["bundleVerificationSelectionProofPassed"]),
    bundleVerificationValidationManifestPathReported:
      resolveBooleanCandidate(["bundleVerificationValidationManifestPathReported"]),
    bundleVerificationSelectionGateSatisfied:
      resolveBooleanCandidate(["bundleVerificationSelectionGateSatisfied"]),
  };
}

async function runRollbackCommand(envFile) {
  const argv = ["bash", "scripts/prod-rollback-eve-safe-lane.sh"];
  const startedAt = new Date().toISOString();
  return await new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      env: {
        ...process.env,
        UNIFIED_RUNTIME_ENV_FILE: envFile,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code, signal) => {
      resolve({
        argv,
        startedAtIso: startedAt,
        finishedAtIso: new Date().toISOString(),
        code: Number(code ?? -1),
        signal: signal ?? null,
        stdout,
        stderr,
        pass: code === 0,
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const envFile = path.resolve(
    options.envFile || process.env.UNIFIED_RUNTIME_ENV_FILE || path.join(process.env.HOME || "", ".openclaw/run/gateway.env"),
  );
  const evidenceSelectionMode = normalizeEvidenceSelection(options.evidenceSelectionMode, "latest");

  const validationSummaryPath = await resolveEvidencePath({
    explicitPath: options.validationSummaryFile,
    evidenceDir,
    prefix: "validation-summary-",
    evidenceSelectionMode,
    passingSelector: (payload) => payload?.gates?.passed === true,
  });
  const cutoverReadinessPath = await resolveEvidencePath({
    explicitPath: options.cutoverReadinessFile,
    evidenceDir,
    prefix: "cutover-readiness-",
    evidenceSelectionMode,
    passingSelector: (payload) => payload?.pass === true,
  });
  const releaseReadinessPath = await resolveEvidencePath({
    explicitPath: options.releaseReadinessFile,
    evidenceDir,
    prefix: "release-readiness-",
    evidenceSelectionMode,
    passingSelector: (payload) => payload?.pass === true,
  });
  const stagePromotionPath = await resolveEvidencePath({
    explicitPath: options.stagePromotionReadinessFile,
    evidenceDir,
    prefix: "stage-promotion-readiness-",
    evidenceSelectionMode,
    passingSelector: (payload) => {
      if (payload?.pass !== true) {
        return false;
      }
      const stageGoalPolicySignals = resolveStagePromotionGoalPolicySignals(payload);
      return (
        stageGoalPolicySignals.mergeBundleReleaseReported
        && stageGoalPolicySignals.mergeBundleReleasePassed
        && stageGoalPolicySignals.mergeBundleInitialScopeReported
        && stageGoalPolicySignals.mergeBundleInitialScopePassed
        && stageGoalPolicySignals.bundleVerificationReleaseReported
        && stageGoalPolicySignals.bundleVerificationReleasePassed
        && stageGoalPolicySignals.bundleVerificationInitialScopeReported
        && stageGoalPolicySignals.bundleVerificationInitialScopePassed
        && stageGoalPolicySignals.bundleVerificationSelectionSignalReported
        && stageGoalPolicySignals.bundleVerificationSelectionProofPassed
        && stageGoalPolicySignals.bundleVerificationValidationManifestPathReported
        && stageGoalPolicySignals.bundleVerificationSelectionGateSatisfied
      );
    },
  });

  const failures = [];
  if (
    isNonEmptyString(options.evidenceSelectionMode) &&
    !VALID_EVIDENCE_SELECTION_MODES.includes(evidenceSelectionMode)
  ) {
    failures.push(`invalid_evidence_selection_mode:${String(options.evidenceSelectionMode)}`);
  }
  if (!(await exists(validationSummaryPath))) {
    failures.push("missing_validation_summary");
  }
  if (!(await exists(cutoverReadinessPath))) {
    failures.push("missing_cutover_readiness");
  }
  if (!(await exists(releaseReadinessPath))) {
    failures.push("missing_release_readiness");
  }
  if (!(await exists(stagePromotionPath))) {
    failures.push("missing_stage_promotion_readiness");
  }

  let horizonStatus = null;
  if (await exists(horizonStatusFile)) {
    horizonStatus = await readJson(horizonStatusFile);
  } else {
    failures.push("missing_horizon_status_file");
  }

  const activeHorizon = String(horizonStatus?.activeHorizon ?? "");
  const inferredStage = normalizeStage(
    options.stage || (activeHorizon === "H2" ? "canary" : activeHorizon === "H3" ? "majority" : activeHorizon === "H4" || activeHorizon === "H5" || activeHorizon === "H6" || activeHorizon === "H7" || activeHorizon === "H8" || activeHorizon === "H9" || activeHorizon === "H10" || activeHorizon === "H11" || activeHorizon === "H12" || activeHorizon === "H13" || activeHorizon === "H14" || activeHorizon === "H15" || activeHorizon === "H16" || activeHorizon === "H17" || activeHorizon === "H18" || activeHorizon === "H19" || activeHorizon === "H20" || activeHorizon === "H21" || activeHorizon === "H22" || activeHorizon === "H23" || activeHorizon === "H24" || activeHorizon === "H25" || activeHorizon === "H26" || activeHorizon === "H27" || activeHorizon === "H28" || activeHorizon === "H29" || activeHorizon === "H30" || activeHorizon === "H31" || activeHorizon === "H32" || activeHorizon === "H33" || activeHorizon === "H34" || activeHorizon === "H35" || activeHorizon === "H36" || activeHorizon === "H37" || activeHorizon === "H38" || activeHorizon === "H39" ? "full" : "shadow"),
    "shadow",
  );
  const stage = normalizeStage(options.stage, inferredStage);
  if (!VALID_STAGES.includes(stage)) {
    failures.push(`invalid_stage:${options.stage || "<empty>"}`);
  }

  const validationSummary = await exists(validationSummaryPath)
    ? await readJson(validationSummaryPath)
    : null;
  const cutoverReadiness = await exists(cutoverReadinessPath)
    ? await readJson(cutoverReadinessPath)
    : null;
  const releaseReadiness = await exists(releaseReadinessPath)
    ? await readJson(releaseReadinessPath)
    : null;
  const stagePromotion = await exists(stagePromotionPath)
    ? await readJson(stagePromotionPath)
    : null;
  const releaseReadinessSchema = validateManifestSchema("release-readiness", releaseReadiness);
  const stagePromotionSchema = validateManifestSchema("stage-promotion-readiness", stagePromotion);
  const stagePromotionGoalPolicySignals = resolveStagePromotionGoalPolicySignals(
    stagePromotion,
  );

  if (validationSummary?.gates?.passed !== true) {
    failures.push("validation_summary_gate_failed");
  }
  if (cutoverReadiness?.pass !== true) {
    failures.push("cutover_readiness_failed");
  }
  if (releaseReadiness?.pass !== true) {
    failures.push("release_readiness_failed");
  }
  if (!releaseReadinessSchema.valid) {
    failures.push(...releaseReadinessSchema.errors.map((error) => `release_readiness_schema_invalid:${error}`));
  }
  if (releaseReadiness?.checks?.goalPolicyFileValidationPassed !== true) {
    failures.push("release_goal_policy_file_validation_not_passed");
  }
  if (releaseReadiness?.checks?.goalPolicySourceConsistencyPassed !== true) {
    failures.push("release_goal_policy_source_consistency_not_passed");
  }
  if (stagePromotion?.pass !== true) {
    failures.push("stage_promotion_readiness_failed");
  } else if (!stagePromotionSchema.valid) {
    failures.push(...stagePromotionSchema.errors.map((error) => `stage_promotion_schema_invalid:${error}`));
  } else {
    if (!stagePromotionGoalPolicySignals.mergeBundleReleaseReported) {
      failures.push("stage_promotion_merge_bundle_release_goal_policy_validation_not_reported");
    } else if (!stagePromotionGoalPolicySignals.mergeBundleReleasePassed) {
      failures.push("stage_promotion_merge_bundle_release_goal_policy_validation_not_passed");
    }
    if (!stagePromotionGoalPolicySignals.mergeBundleReleaseSourceConsistencyReported) {
      failures.push(
        "stage_promotion_merge_bundle_release_goal_policy_source_consistency_not_reported",
      );
    } else if (!stagePromotionGoalPolicySignals.mergeBundleReleaseSourceConsistencyPassed) {
      failures.push(
        "stage_promotion_merge_bundle_release_goal_policy_source_consistency_not_passed",
      );
    }
    if (!stagePromotionGoalPolicySignals.mergeBundleInitialScopeReported) {
      failures.push("stage_promotion_merge_bundle_initial_scope_goal_policy_validation_not_reported");
    } else if (!stagePromotionGoalPolicySignals.mergeBundleInitialScopePassed) {
      failures.push("stage_promotion_merge_bundle_initial_scope_goal_policy_validation_not_passed");
    }
    if (!stagePromotionGoalPolicySignals.bundleVerificationReleaseReported) {
      failures.push("stage_promotion_bundle_verification_release_goal_policy_validation_not_reported");
    } else if (!stagePromotionGoalPolicySignals.bundleVerificationReleasePassed) {
      failures.push("stage_promotion_bundle_verification_release_goal_policy_validation_not_passed");
    }
    if (!stagePromotionGoalPolicySignals.bundleVerificationReleaseSourceConsistencyReported) {
      failures.push(
        "stage_promotion_bundle_verification_release_goal_policy_source_consistency_not_reported",
      );
    } else if (!stagePromotionGoalPolicySignals.bundleVerificationReleaseSourceConsistencyPassed) {
      failures.push(
        "stage_promotion_bundle_verification_release_goal_policy_source_consistency_not_passed",
      );
    }
    if (!stagePromotionGoalPolicySignals.bundleVerificationInitialScopeReported) {
      failures.push(
        "stage_promotion_bundle_verification_initial_scope_goal_policy_validation_not_reported",
      );
    } else if (!stagePromotionGoalPolicySignals.bundleVerificationInitialScopePassed) {
      failures.push(
        "stage_promotion_bundle_verification_initial_scope_goal_policy_validation_not_passed",
      );
    }
    if (!stagePromotionGoalPolicySignals.bundleVerificationSelectionSignalReported) {
      failures.push("stage_promotion_bundle_verification_selection_proof_not_reported");
    } else if (!stagePromotionGoalPolicySignals.bundleVerificationSelectionProofPassed) {
      failures.push("stage_promotion_bundle_verification_selection_proof_not_passed");
    }
    if (!stagePromotionGoalPolicySignals.bundleVerificationValidationManifestPathReported) {
      failures.push("stage_promotion_bundle_verification_validation_manifest_path_not_reported");
    }
    if (!stagePromotionGoalPolicySignals.bundleVerificationSelectionGateSatisfied) {
      failures.push("stage_promotion_bundle_verification_selection_gate_not_passed");
    }
  }

  const metrics = {
    successRate: toFiniteNumber(validationSummary?.metrics?.successRate, 0),
    missingTraceRate: toFiniteNumber(validationSummary?.metrics?.missingTraceRate, 1),
    unclassifiedFailures: toFiniteNumber(validationSummary?.metrics?.unclassifiedFailures, Number.POSITIVE_INFINITY),
    failureScenarioPassCount: toFiniteNumber(validationSummary?.metrics?.failureScenarioPassCount, 0),
    p95LatencyMs: toFiniteNumber(validationSummary?.metrics?.p95LatencyMs, Number.POSITIVE_INFINITY),
  };

  const thresholds = {
    minSuccessRate: toFiniteNumber(options.minSuccessRate, stage === "canary" ? 0.99 : 0.995),
    maxMissingTraceRate: toFiniteNumber(options.maxMissingTraceRate, 0),
    maxUnclassifiedFailures: toFiniteNumber(options.maxUnclassifiedFailures, 0),
    minFailureScenarioPassCount: toFiniteNumber(options.minFailureScenarioPassCount, stage === "canary" ? 5 : 5),
    maxP95LatencyMs: toFiniteNumber(options.maxP95LatencyMs, stage === "canary" ? 2500 : 2000),
  };
  const thresholdReasons = evaluateThresholds(stage, metrics, thresholds);
  const stageRequiresRollback = stage !== "shadow" && stage !== "canary"
    ? thresholdReasons.length > 0
    : thresholdReasons.length > 0 && metrics.successRate < 0.98;

  const decisionReasons = [...failures];
  if (thresholdReasons.length > 0) {
    decisionReasons.push(...thresholdReasons);
  }

  const decision = stageRequiresRollback || failures.length > 0
    ? DECISION_ROLLBACK
    : DECISION_HOLD;
  const shouldApplyRollback = options.autoApplyRollback && decision === DECISION_ROLLBACK;

  let rollbackExecution = null;
  if (shouldApplyRollback) {
    if (!(await exists(envFile))) {
      decisionReasons.push(`missing_env_file:${envFile}`);
    } else {
      rollbackExecution = await runRollbackCommand(envFile);
      if (!rollbackExecution.pass) {
        decisionReasons.push("rollback_command_failed");
      }
    }
  }

  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `auto-rollback-policy-${formatStamp()}.json`),
  );
  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: decisionReasons.length === 0 && decision === DECISION_HOLD,
    decision: {
      action: decision,
      shouldRollback: decision === DECISION_ROLLBACK,
      autoApplyRollbackRequested: options.autoApplyRollback,
      rollbackApplied: rollbackExecution?.pass === true,
    },
    stage,
    autoApplyRollback: options.autoApplyRollback,
    rollbackApplied: rollbackExecution?.pass === true,
    reasons: decisionReasons,
    triggers: decisionReasons,
    files: {
      evidenceDir,
      horizonStatusFile: await exists(horizonStatusFile) ? horizonStatusFile : null,
      envFile: await exists(envFile) ? envFile : null,
      validationSummary: validationSummaryPath || null,
      cutoverReadiness: cutoverReadinessPath || null,
      releaseReadiness: releaseReadinessPath || null,
      stagePromotionReadiness: stagePromotionPath || null,
      outPath,
    },
    checks: {
      activeHorizon: isNonEmptyString(activeHorizon) ? activeHorizon : null,
      evidenceSelectionMode,
      metrics,
      thresholds,
      thresholdReasons,
      validationSummaryPassed: validationSummary?.gates?.passed === true,
      cutoverReadinessPassed: cutoverReadiness?.pass === true,
      releaseReadinessPassed: releaseReadiness?.pass === true,
      releaseReadinessSchemaValid: releaseReadinessSchema.valid,
      releaseReadinessSchemaErrors:
        releaseReadinessSchema.valid || releaseReadinessSchema.errors.length === 0
          ? null
          : releaseReadinessSchema.errors,
      releaseGoalPolicyFileValidationPassed:
        releaseReadiness?.checks?.goalPolicyFileValidationPassed === true,
      releaseGoalPolicySourceConsistencyPassed:
        releaseReadiness?.checks?.goalPolicySourceConsistencyPassed === true,
      stagePromotionReadinessPassed: stagePromotion?.pass === true,
      stagePromotionSchemaValid: stagePromotionSchema.valid,
      stagePromotionSchemaErrors:
        stagePromotionSchema.valid || stagePromotionSchema.errors.length === 0
          ? null
          : stagePromotionSchema.errors,
      stagePromotionMergeBundleGoalPolicyValidationReported:
        stagePromotionGoalPolicySignals.mergeBundleReleaseReported,
      stagePromotionMergeBundleGoalPolicyValidationPassed:
        stagePromotionGoalPolicySignals.mergeBundleReleasePassed,
      stagePromotionMergeBundleGoalPolicySourceConsistencyReported:
        stagePromotionGoalPolicySignals.mergeBundleReleaseSourceConsistencyReported,
      stagePromotionMergeBundleGoalPolicySourceConsistencyPassed:
        stagePromotionGoalPolicySignals.mergeBundleReleaseSourceConsistencyPassed,
      stagePromotionMergeBundleInitialScopeGoalPolicyValidationReported:
        stagePromotionGoalPolicySignals.mergeBundleInitialScopeReported,
      stagePromotionMergeBundleInitialScopeGoalPolicyValidationPassed:
        stagePromotionGoalPolicySignals.mergeBundleInitialScopePassed,
      stagePromotionBundleVerificationGoalPolicyValidationReported:
        stagePromotionGoalPolicySignals.bundleVerificationReleaseReported,
      stagePromotionBundleVerificationGoalPolicyValidationPassed:
        stagePromotionGoalPolicySignals.bundleVerificationReleasePassed,
      stagePromotionBundleVerificationGoalPolicySourceConsistencyReported:
        stagePromotionGoalPolicySignals.bundleVerificationReleaseSourceConsistencyReported,
      stagePromotionBundleVerificationGoalPolicySourceConsistencyPassed:
        stagePromotionGoalPolicySignals.bundleVerificationReleaseSourceConsistencyPassed,
      stagePromotionBundleVerificationInitialScopeGoalPolicyValidationReported:
        stagePromotionGoalPolicySignals.bundleVerificationInitialScopeReported,
      stagePromotionBundleVerificationInitialScopeGoalPolicyValidationPassed:
        stagePromotionGoalPolicySignals.bundleVerificationInitialScopePassed,
      stagePromotionBundleVerificationSelectionSignalReported:
        stagePromotionGoalPolicySignals.bundleVerificationSelectionSignalReported,
      stagePromotionBundleVerificationSelectionProofPassed:
        stagePromotionGoalPolicySignals.bundleVerificationSelectionProofPassed,
      stagePromotionBundleVerificationValidationManifestPathReported:
        stagePromotionGoalPolicySignals.bundleVerificationValidationManifestPathReported,
      stagePromotionBundleVerificationSelectionGateSatisfied:
        stagePromotionGoalPolicySignals.bundleVerificationSelectionGateSatisfied,
    },
    rollbackExecution,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);

  if (decision === DECISION_ROLLBACK) {
    process.exitCode = shouldApplyRollback ? (rollbackExecution?.pass === true ? 2 : 2) : 2;
    process.stderr.write(`Auto-rollback policy evaluation failed:\n- ${decisionReasons.join("\n- ")}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
