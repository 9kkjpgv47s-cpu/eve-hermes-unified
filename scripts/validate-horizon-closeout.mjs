#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";
import { HORIZON_SEQUENCE, HORIZON_STAGE_MAP } from "./horizon-constants.mjs";

const execFile = promisify(execFileCallback);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeHorizon(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return HORIZON_SEQUENCE.includes(normalized) ? normalized : "";
}

function deriveNextHorizon(sourceHorizon) {
  const sourceIndex = HORIZON_SEQUENCE.indexOf(sourceHorizon);
  if (sourceIndex < 0 || sourceIndex >= HORIZON_SEQUENCE.length - 1) {
    return "";
  }
  return HORIZON_SEQUENCE[sourceIndex + 1];
}

function normalizeCommand(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function splitNormalizedCommand(command) {
  return normalizeCommand(command)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function readCommandOptionValue(tokens, optionNames) {
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    for (const optionName of optionNames) {
      if (token === optionName) {
        return tokens[index + 1] ?? "";
      }
      if (token.startsWith(`${optionName}=`)) {
        return token.slice(optionName.length + 1);
      }
    }
  }
  return "";
}

function parseHorizonRunnerCommand(command) {
  const normalized = normalizeCommand(command);
  const match = normalized.match(/^npm run run:h([1-9])-(closeout|promotion)(?:\s+.*)?$/);
  if (match) {
    const source = normalizeHorizon(`H${String(match[1])}`);
    const kind = String(match[2]);
    const next = deriveNextHorizon(source);
    return {
      source,
      kind,
      next,
    };
  }

  const genericMatch = normalized.match(/^npm run run:horizon-(closeout|promotion)(?:\s+.*)?$/);
  if (!genericMatch) {
    return null;
  }
  const tokens = splitNormalizedCommand(normalized);
  const kind = String(genericMatch[1]);
  const source = normalizeHorizon(
    readCommandOptionValue(tokens, ["--horizon", "--source-horizon"]),
  );
  const nextFromOption = normalizeHorizon(
    readCommandOptionValue(tokens, ["--next-horizon", "--target-next-horizon"]),
  );
  const next = nextFromOption || deriveNextHorizon(source);
  return {
    source,
    kind,
    next,
  };
}

function resolveBooleanSignal(checks, keys) {
  for (const key of keys) {
    const candidate = checks?.[key];
    if (typeof candidate === "boolean") {
      return { reported: true, pass: candidate };
    }
  }
  return { reported: false, pass: false };
}

function evidenceEntryAppliesToHorizon(entry, targetHorizon) {
  if (!entry || typeof entry !== "object") {
    return false;
  }
  const target = String(targetHorizon ?? "").trim().toUpperCase();
  if (!target) {
    return false;
  }
  const scopedHorizons = Array.isArray(entry.horizons)
    ? entry.horizons
    : Array.isArray(entry.targetHorizons)
      ? entry.targetHorizons
      : [];
  if (scopedHorizons.length > 0) {
    return scopedHorizons
      .map((value) => String(value ?? "").trim().toUpperCase())
      .includes(target);
  }
  const singleScope = String(entry.horizon ?? entry.targetHorizon ?? "all")
    .trim()
    .toUpperCase();
  if (singleScope === "ALL" || singleScope.length === 0) {
    return true;
  }
  return singleScope === target;
}

async function runH5EvidenceBundleGate(horizonStatusFile, evidenceDir) {
  const scriptPath = path.join(REPO_ROOT, "scripts", "validate-h5-evidence-bundle.mjs");
  try {
    await execFile(process.execPath, [scriptPath, "--horizon-status-file", horizonStatusFile, "--evidence-dir", evidenceDir], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { pass: true };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return { pass: false, code };
  }
}

async function runH6EvidenceBundleGate(horizonStatusFile, evidenceDir) {
  const scriptPath = path.join(REPO_ROOT, "scripts", "validate-h6-evidence-bundle.mjs");
  try {
    await execFile(process.execPath, [scriptPath, "--horizon-status-file", horizonStatusFile, "--evidence-dir", evidenceDir], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { pass: true };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return { pass: false, code };
  }
}

async function runH7EvidenceBundleGate(horizonStatusFile, evidenceDir) {
  const scriptPath = path.join(REPO_ROOT, "scripts", "validate-h7-evidence-bundle.mjs");
  try {
    await execFile(process.execPath, [scriptPath, "--horizon-status-file", horizonStatusFile, "--evidence-dir", evidenceDir], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { pass: true };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return { pass: false, code };
  }
}

async function runH8EvidenceBundleGate(horizonStatusFile, evidenceDir) {
  const scriptPath = path.join(REPO_ROOT, "scripts", "validate-h8-evidence-bundle.mjs");
  try {
    await execFile(process.execPath, [scriptPath, "--horizon-status-file", horizonStatusFile, "--evidence-dir", evidenceDir], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { pass: true };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return { pass: false, code };
  }
}

function parseArgs(argv) {
  const options = {
    horizon: "",
    nextHorizon: "",
    evidenceDir: "",
    horizonStatusFile: "",
    out: "",
    requireActiveNextHorizon: false,
    requireCompletedActions: false,
    allowHorizonMismatch: false,
    requireH5EvidenceBundle: false,
    requireH6EvidenceBundle: false,
    requireH7EvidenceBundle: false,
    requireH8EvidenceBundle: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--horizon") {
      options.horizon = value ?? "";
      index += 1;
    } else if (arg === "--next-horizon") {
      options.nextHorizon = value ?? "";
      index += 1;
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--require-active-next-horizon") {
      options.requireActiveNextHorizon = true;
    } else if (arg === "--require-completed-actions") {
      options.requireCompletedActions = true;
    } else if (arg === "--allow-horizon-mismatch") {
      options.allowHorizonMismatch = true;
    } else if (arg === "--require-h5-evidence-bundle") {
      options.requireH5EvidenceBundle = true;
    } else if (arg === "--require-h6-evidence-bundle") {
      options.requireH6EvidenceBundle = true;
    } else if (arg === "--require-h7-evidence-bundle") {
      options.requireH7EvidenceBundle = true;
    } else if (arg === "--require-h8-evidence-bundle") {
      options.requireH8EvidenceBundle = true;
    }
  }
  return options;
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

function patternToRegexSource(pattern) {
  const segments = pattern.split("*");
  const escaped = segments.map((segment) =>
    segment.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"),
  );
  return `^${escaped.join(".*")}$`;
}

function trimEvidencePrefix(value) {
  const normalized = String(value).replace(/\\/g, "/");
  return normalized.startsWith("evidence/") ? normalized.slice("evidence/".length) : normalized;
}

function matchArtifactPattern(pattern, filePath, evidenceDir) {
  const normalizedPattern = String(pattern ?? "").trim().replace(/\\/g, "/");
  if (!normalizedPattern) {
    return false;
  }
  const regex = new RegExp(patternToRegexSource(normalizedPattern));
  const absolutePath = path.resolve(filePath).replace(/\\/g, "/");
  const relativeToCwd = path.relative(process.cwd(), filePath).replace(/\\/g, "/");
  const relativeToEvidence = path.relative(evidenceDir, filePath).replace(/\\/g, "/");
  const baseName = path.basename(filePath);
  const candidates = [
    absolutePath,
    absolutePath.replace(/^\/+/, ""),
    relativeToCwd,
    trimEvidencePrefix(relativeToCwd),
    relativeToEvidence,
    `evidence/${relativeToEvidence}`,
    trimEvidencePrefix(`evidence/${relativeToEvidence}`),
    baseName,
  ];
  return candidates.some((candidate) => regex.test(candidate));
}

async function listTopLevelFiles(evidenceDir) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(evidenceDir, entry.name))
    .sort();
}

async function newestFileInDir(evidenceDir, prefix) {
  const entries = await readdir(evidenceDir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(evidenceDir, entry.name))
    .sort();
  return matches.length > 0 ? matches[matches.length - 1] : "";
}

function sortByGeneratedAtDesc(entries) {
  return [...entries].sort((left, right) => {
    const leftGenerated = Date.parse(String(left?.payload?.generatedAtIso ?? ""));
    const rightGenerated = Date.parse(String(right?.payload?.generatedAtIso ?? ""));
    if (Number.isFinite(leftGenerated) && Number.isFinite(rightGenerated) && leftGenerated !== rightGenerated) {
      return rightGenerated - leftGenerated;
    }
    return String(right.path ?? "").localeCompare(String(left.path ?? ""));
  });
}

function commandVerificationType(command) {
  const runnerCommand = parseHorizonRunnerCommand(command);
  if (runnerCommand?.kind === "closeout") {
    return "horizon-closeout-run";
  }
  if (runnerCommand?.kind === "promotion") {
    return "horizon-promotion-run";
  }
  if (command === "npm run validate:evidence-summary" || command === "npm run validate:all") {
    return "validation-summary";
  }
  if (command === "npm run validate:release-readiness") {
    return "release-readiness";
  }
  if (command === "npm run validate:merge-bundle") {
    return "merge-bundle-validation";
  }
  if (command === "npm run verify:merge-bundle") {
    return "bundle-verification";
  }
  if (command === "npm run validate:cutover-readiness") {
    return "pass-only";
  }
  if (command === "npm run run:h2-drill-suite") {
    return "h2-drill-suite";
  }
  if (command === "npm run calibrate:rollback-thresholds") {
    return "rollback-threshold-calibration";
  }
  if (command === "npm run run:supervised-rollback-simulation") {
    return "supervised-rollback-simulation";
  }
  if (command === "npm run validate:initial-scope") {
    return "initial-scope";
  }
  return "existence-only";
}

function resolveInitialScopeGoalPolicyValidationState(payload) {
  if (!payload || typeof payload !== "object") {
    return { reported: false, pass: false };
  }
  const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};
  const candidates = [
    payload.releaseReadinessGoalPolicyValidationPass,
    checks.releaseReadinessGoalPolicyValidationPassed,
    checks.releaseReadinessGoalPolicyFileValidationPassed,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return { reported: true, pass: candidate };
    }
  }
  return { reported: false, pass: false };
}

function resolveReleaseGoalPolicyValidationStatus(payload) {
  const checks = payload?.checks && typeof payload.checks === "object" ? payload.checks : {};
  const candidates = [
    checks.goalPolicyFileValidationPassed,
    checks.goalPolicyValidationPassed,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "boolean") {
      return { reported: true, pass: candidate };
    }
  }
  return { reported: false, pass: false };
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

function resolveStagePromotionGoalPolicySignals(payload) {
  const checks = payload?.checks && typeof payload.checks === "object" ? payload.checks : {};
  const releaseSourceConsistency = resolveGoalPolicySourceConsistencyState(
    { checks },
    [
      "releaseGoalPolicySourceConsistencyPassed",
      "releaseGoalPolicySourceConsistencyPass",
    ],
  );
  const mergeBundleReleaseSourceConsistency = resolveGoalPolicySourceConsistencyState(
    { checks },
    [
      "mergeBundleReleaseGoalPolicySourceConsistencyPassed",
      "mergeBundleGoalPolicySourceConsistencyPassed",
    ],
  );
  const bundleVerificationReleaseSourceConsistency = resolveGoalPolicySourceConsistencyState(
    { checks },
    [
      "bundleVerificationReleaseGoalPolicySourceConsistencyPassed",
      "bundleVerificationGoalPolicySourceConsistencyPassed",
    ],
  );
  const propagationReported =
    releaseSourceConsistency.reported
    && mergeBundleReleaseSourceConsistency.reported
    && bundleVerificationReleaseSourceConsistency.reported;
  const propagationPassed =
    releaseSourceConsistency.pass
    && mergeBundleReleaseSourceConsistency.pass
    && bundleVerificationReleaseSourceConsistency.pass;
  return {
    releaseSourceConsistency,
    mergeBundleReleaseSourceConsistency,
    bundleVerificationReleaseSourceConsistency,
    propagationReported,
    propagationPassed,
  };
}

function resolveBundleVerificationSelectionSignals(payload) {
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
  const validationManifestPath = isNonEmptyString(files.validationManifestPath)
    ? String(files.validationManifestPath).trim()
    : "";
  const validationManifestPathReported = validationManifestPath.length > 0;
  const selectionGateSatisfied =
    selectionSignalReported && selectionProofPassed && validationManifestPathReported;
  return {
    latestRequestedReported,
    latestRequested,
    latestAliasResolved,
    latestAliasFallbackUsed,
    validationManifestResolvedReported,
    validationManifestResolved,
    selectionSignalReported,
    selectionProofPassed,
    validationManifestPathReported,
    selectionGateSatisfied,
  };
}

function evaluateCommandPayload(command, payload, targetHorizon = "") {
  const verificationType = commandVerificationType(command);
  const runnerCommand = parseHorizonRunnerCommand(command);
  if (verificationType === "existence-only") {
    return { pass: true, checks: [] };
  }
  if (!payload || typeof payload !== "object") {
    return { pass: false, checks: ["artifact_not_json_object"] };
  }
  if (verificationType === "validation-summary") {
    return {
      pass: payload?.gates?.passed === true,
      checks: payload?.gates?.passed === true ? [] : ["validation_summary_gate_failed"],
    };
  }
  if (verificationType === "release-readiness") {
    const schema = validateManifestSchema("release-readiness", payload);
    const checks = [];
    if (!schema.valid) {
      checks.push(...schema.errors.map((error) => `release_schema_invalid:${error}`));
    }
    if (payload.pass !== true) {
      checks.push("release_readiness_not_passed");
    }
    const releaseGoalPolicyValidation = resolveReleaseGoalPolicyValidationStatus(payload);
    if (!releaseGoalPolicyValidation.reported) {
      checks.push("release_goal_policy_validation_not_reported");
    } else if (!releaseGoalPolicyValidation.pass) {
      checks.push("release_goal_policy_validation_not_passed");
    }
    const releaseGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(payload, [
      "goalPolicySourceConsistencyPassed",
      "goalPolicySourceConsistencyPass",
    ]);
    if (!releaseGoalPolicySourceConsistency.reported) {
      checks.push("release_goal_policy_source_consistency_not_reported");
    } else if (!releaseGoalPolicySourceConsistency.pass) {
      checks.push("release_goal_policy_source_consistency_not_passed");
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "merge-bundle-validation") {
    const schema = validateManifestSchema("merge-bundle-validation", payload);
    const checks = [];
    if (!schema.valid) {
      checks.push(...schema.errors.map((error) => `merge_bundle_schema_invalid:${error}`));
    }
    if (payload.pass !== true) {
      checks.push("merge_bundle_validation_not_passed");
    }
    const releaseGoalPolicyValidation = resolveGoalPolicyValidationState(payload, [
      "releaseGoalPolicyValidationPassed",
    ]);
    if (!releaseGoalPolicyValidation.reported) {
      checks.push("merge_bundle_release_goal_policy_validation_not_reported");
    } else if (!releaseGoalPolicyValidation.pass) {
      checks.push("merge_bundle_release_goal_policy_validation_not_passed");
    }
    const initialScopeGoalPolicyValidation = resolveGoalPolicyValidationState(payload, [
      "initialScopeGoalPolicyValidationPassed",
    ]);
    if (!initialScopeGoalPolicyValidation.reported) {
      checks.push("merge_bundle_initial_scope_goal_policy_validation_not_reported");
    } else if (!initialScopeGoalPolicyValidation.pass) {
      checks.push("merge_bundle_initial_scope_goal_policy_validation_not_passed");
    }
    const releaseGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(payload, [
      "releaseGoalPolicySourceConsistencyPassed",
      "releaseGoalPolicySourceConsistencyPass",
    ]);
    if (!releaseGoalPolicySourceConsistency.reported) {
      checks.push("merge_bundle_release_goal_policy_source_consistency_not_reported");
    } else if (!releaseGoalPolicySourceConsistency.pass) {
      checks.push("merge_bundle_release_goal_policy_source_consistency_not_passed");
    }
    const initialScopeGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(payload, [
      "initialScopeGoalPolicySourceConsistencyPassed",
      "initialScopeGoalPolicySourceConsistencyPass",
    ]);
    if (!initialScopeGoalPolicySourceConsistency.reported) {
      checks.push("merge_bundle_initial_scope_goal_policy_source_consistency_not_reported");
    } else if (!initialScopeGoalPolicySourceConsistency.pass) {
      checks.push("merge_bundle_initial_scope_goal_policy_source_consistency_not_passed");
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "bundle-verification") {
    const checks = [];
    if (payload.pass !== true) {
      checks.push("bundle_verification_not_passed");
    }
    const releaseGoalPolicyValidation = resolveGoalPolicyValidationState(payload, [
      "releaseGoalPolicyValidationPassed",
    ]);
    if (!releaseGoalPolicyValidation.reported) {
      checks.push("bundle_verify_release_goal_policy_validation_not_reported");
    } else if (!releaseGoalPolicyValidation.pass) {
      checks.push("bundle_verify_release_goal_policy_validation_not_passed");
    }
    const initialScopeGoalPolicyValidation = resolveGoalPolicyValidationState(payload, [
      "initialScopeGoalPolicyValidationPassed",
    ]);
    if (!initialScopeGoalPolicyValidation.reported) {
      checks.push("bundle_verify_initial_scope_goal_policy_validation_not_reported");
    } else if (!initialScopeGoalPolicyValidation.pass) {
      checks.push("bundle_verify_initial_scope_goal_policy_validation_not_passed");
    }
    const releaseGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(payload, [
      "releaseGoalPolicySourceConsistencyPassed",
      "releaseGoalPolicySourceConsistencyPass",
    ]);
    if (!releaseGoalPolicySourceConsistency.reported) {
      checks.push("bundle_verify_release_goal_policy_source_consistency_not_reported");
    } else if (!releaseGoalPolicySourceConsistency.pass) {
      checks.push("bundle_verify_release_goal_policy_source_consistency_not_passed");
    }
    const initialScopeGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(payload, [
      "initialScopeGoalPolicySourceConsistencyPassed",
      "initialScopeGoalPolicySourceConsistencyPass",
    ]);
    if (!initialScopeGoalPolicySourceConsistency.reported) {
      checks.push("bundle_verify_initial_scope_goal_policy_source_consistency_not_reported");
    } else if (!initialScopeGoalPolicySourceConsistency.pass) {
      checks.push("bundle_verify_initial_scope_goal_policy_source_consistency_not_passed");
    }
    const selectionSignals = resolveBundleVerificationSelectionSignals(payload);
    if (!selectionSignals.selectionSignalReported) {
      checks.push("bundle_verify_selection_proof_not_reported");
    } else if (!selectionSignals.selectionProofPassed) {
      checks.push("bundle_verify_selection_proof_not_passed");
    }
    if (!selectionSignals.validationManifestPathReported) {
      checks.push("bundle_verify_validation_manifest_path_not_reported");
    }
    if (!selectionSignals.selectionGateSatisfied) {
      checks.push("bundle_verify_selection_gate_not_passed");
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "h2-drill-suite") {
    const schema = validateManifestSchema("h2-drill-suite", payload);
    const checks = [];
    if (!schema.valid) {
      checks.push(...schema.errors.map((error) => `h2_drill_suite_schema_invalid:${error}`));
    }
    if (payload.pass !== true) {
      checks.push("h2_drill_suite_not_passed");
    }
    if (payload?.checks?.canaryHoldPass !== true) {
      checks.push("h2_drill_canary_hold_failed");
    }
    if (payload?.checks?.majorityHoldPass !== true) {
      checks.push("h2_drill_majority_hold_failed");
    }
    if (payload?.checks?.rollbackSimulationPass !== true) {
      checks.push("h2_drill_rollback_simulation_failed");
    }
    if (payload?.checks?.rollbackSimulationTriggered !== true) {
      checks.push("h2_drill_rollback_simulation_not_triggered");
    }
    if (payload?.checks?.rollbackPolicySourceConsistencySignalsReported !== true) {
      checks.push("h2_drill_rollback_source_consistency_signals_not_reported");
    } else if (payload?.checks?.rollbackPolicySourceConsistencySignalsPass !== true) {
      checks.push("h2_drill_rollback_source_consistency_signals_not_passed");
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "horizon-closeout-run") {
    const checks = [];
    const horizonSchema = validateManifestSchema("horizon-closeout-run", payload);
    const h2Schema = validateManifestSchema("h2-closeout-run", payload);
    if (!horizonSchema.valid && !h2Schema.valid) {
      checks.push(
        ...horizonSchema.errors.map((error) => `horizon_closeout_run_schema_invalid:${error}`),
      );
    }
    if (payload.pass !== true) {
      checks.push("horizon_closeout_run_not_passed");
    }
    const expectedSource = runnerCommand?.source || normalizeHorizon(targetHorizon);
    const expectedNext = runnerCommand?.next || deriveNextHorizon(expectedSource);
    const source = normalizeHorizon(payload?.horizon?.source ?? payload?.sourceHorizon ?? "");
    const next = normalizeHorizon(
      payload?.horizon?.next ??
        payload?.nextHorizon ??
        payload?.checks?.nextHorizon ??
        payload?.checks?.nextHorizon?.selectedNextHorizon ??
        "",
    );
    if (!source) {
      checks.push("horizon_closeout_run_source_horizon_not_reported");
    } else if (expectedSource && source !== expectedSource) {
      checks.push(`horizon_closeout_run_source_horizon_mismatch:${source}!=${expectedSource}`);
    }
    if (!next) {
      checks.push("horizon_closeout_run_next_horizon_not_reported");
    } else if (expectedNext && next !== expectedNext) {
      checks.push(`horizon_closeout_run_next_horizon_mismatch:${next}!=${expectedNext}`);
    }
    const signalChecks =
      payload?.checks && typeof payload.checks === "object" ? payload.checks : {};
    const closeoutGateSignal = resolveBooleanSignal(signalChecks, [
      "horizonCloseoutGatePass",
      "h2CloseoutGatePass",
    ]);
    if (!closeoutGateSignal.reported) {
      checks.push("horizon_closeout_run_gate_not_reported");
    } else if (!closeoutGateSignal.pass) {
      checks.push("horizon_closeout_run_gate_not_passed");
    }
    const supervisedSimulationSignal = resolveBooleanSignal(signalChecks, [
      "supervisedSimulationPass",
    ]);
    if (!supervisedSimulationSignal.reported) {
      checks.push("horizon_closeout_run_supervised_simulation_not_reported");
    } else if (!supervisedSimulationSignal.pass) {
      checks.push("horizon_closeout_run_supervised_simulation_not_passed");
    }
    const validationPropagationReported = resolveBooleanSignal(signalChecks, [
      "supervisedSimulationStageGoalPolicyPropagationReported",
      "supervisedSimulationStageGoalPolicyValidationPropagationReported",
      "supervisedSimulationStagePolicySignalsReported",
    ]);
    const validationPropagationPassed = resolveBooleanSignal(signalChecks, [
      "supervisedSimulationStageGoalPolicyPropagationPassed",
      "supervisedSimulationStageGoalPolicyValidationPropagationPassed",
      "supervisedSimulationStagePolicySignalsPass",
    ]);
    if (!validationPropagationReported.reported || !validationPropagationReported.pass) {
      checks.push("horizon_closeout_run_supervised_stage_goal_policy_not_reported");
    } else if (!validationPropagationPassed.reported) {
      checks.push("horizon_closeout_run_supervised_stage_goal_policy_pass_not_reported");
    } else if (!validationPropagationPassed.pass) {
      checks.push("horizon_closeout_run_supervised_stage_goal_policy_not_passed");
    }
    const sourceConsistencyPropagationReported = resolveBooleanSignal(signalChecks, [
      "supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported",
      "supervisedSimulationStageSourceConsistencySignalsReported",
    ]);
    const sourceConsistencyPropagationPassed = resolveBooleanSignal(signalChecks, [
      "supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed",
      "supervisedSimulationStageSourceConsistencySignalsPass",
    ]);
    if (
      !sourceConsistencyPropagationReported.reported
      || !sourceConsistencyPropagationReported.pass
    ) {
      checks.push("horizon_closeout_run_supervised_stage_goal_policy_source_consistency_not_reported");
    } else if (!sourceConsistencyPropagationPassed.reported) {
      checks.push(
        "horizon_closeout_run_supervised_stage_goal_policy_source_consistency_pass_not_reported",
      );
    } else if (!sourceConsistencyPropagationPassed.pass) {
      checks.push("horizon_closeout_run_supervised_stage_goal_policy_source_consistency_not_passed");
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "horizon-promotion-run") {
    const checks = [];
    const horizonSchema = validateManifestSchema("horizon-promotion-run", payload);
    const h2Schema = validateManifestSchema("h2-promotion-run", payload);
    if (!horizonSchema.valid && !h2Schema.valid) {
      checks.push(
        ...horizonSchema.errors.map((error) => `horizon_promotion_run_schema_invalid:${error}`),
      );
    }
    if (payload.pass !== true) {
      checks.push("horizon_promotion_run_not_passed");
    }
    const expectedSource = runnerCommand?.source || normalizeHorizon(targetHorizon);
    const expectedNext = runnerCommand?.next || deriveNextHorizon(expectedSource);
    const source = normalizeHorizon(
      payload?.horizon?.source ?? payload?.sourceHorizon ?? payload?.checks?.sourceHorizon ?? "",
    );
    const next = normalizeHorizon(
      payload?.horizon?.next ??
        payload?.nextHorizon ??
        payload?.checks?.nextHorizon ??
        payload?.checks?.nextHorizon?.selectedNextHorizon ??
        "",
    );
    if (!source) {
      checks.push("horizon_promotion_run_source_horizon_not_reported");
    } else if (expectedSource && source !== expectedSource) {
      checks.push(`horizon_promotion_run_source_horizon_mismatch:${source}!=${expectedSource}`);
    }
    if (!next) {
      checks.push("horizon_promotion_run_next_horizon_not_reported");
    } else if (expectedNext && next !== expectedNext) {
      checks.push(`horizon_promotion_run_next_horizon_mismatch:${next}!=${expectedNext}`);
    }
    const signalChecks =
      payload?.checks && typeof payload.checks === "object" ? payload.checks : {};
    if (typeof signalChecks.horizonPromotionPass !== "boolean") {
      checks.push("horizon_promotion_run_gate_not_reported");
    } else if (signalChecks.horizonPromotionPass !== true) {
      checks.push("horizon_promotion_run_gate_not_passed");
    }
    const closeoutRunPassSignal = resolveBooleanSignal(signalChecks, [
      "closeoutRunPass",
    ]);
    if (!closeoutRunPassSignal.reported) {
      checks.push("horizon_promotion_run_closeout_run_pass_not_reported");
    } else if (!closeoutRunPassSignal.pass) {
      checks.push("horizon_promotion_run_closeout_run_not_passed");
    }
    const closeoutGateSignal = resolveBooleanSignal(signalChecks, [
      "closeoutGatePass",
      "closeoutRunH2CloseoutGatePass",
      "closeoutRunHorizonCloseoutGatePass",
    ]);
    if (!closeoutGateSignal.reported) {
      checks.push("horizon_promotion_run_closeout_gate_not_reported");
    } else if (!closeoutGateSignal.pass) {
      checks.push("horizon_promotion_run_closeout_gate_not_passed");
    }
    const validationPropagationReported = resolveBooleanSignal(signalChecks, [
      "closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported",
      "closeoutRunSupervisedSimulationStageGoalPolicyValidationPropagationReported",
    ]);
    const validationPropagationPassed = resolveBooleanSignal(signalChecks, [
      "closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed",
      "closeoutRunSupervisedSimulationStageGoalPolicyValidationPropagationPassed",
    ]);
    if (!validationPropagationReported.reported || !validationPropagationReported.pass) {
      checks.push("horizon_promotion_run_closeout_run_supervised_stage_goal_policy_not_reported");
    } else if (!validationPropagationPassed.reported) {
      checks.push("horizon_promotion_run_closeout_run_supervised_stage_goal_policy_pass_not_reported");
    } else if (!validationPropagationPassed.pass) {
      checks.push("horizon_promotion_run_closeout_run_supervised_stage_goal_policy_not_passed");
    }
    const sourceConsistencyPropagationReported = resolveBooleanSignal(signalChecks, [
      "closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationReported",
    ]);
    const sourceConsistencyPropagationPassed = resolveBooleanSignal(signalChecks, [
      "closeoutRunSupervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed",
    ]);
    if (
      !sourceConsistencyPropagationReported.reported
      || !sourceConsistencyPropagationReported.pass
    ) {
      checks.push(
        "horizon_promotion_run_closeout_run_supervised_stage_goal_policy_source_consistency_not_reported",
      );
    } else if (!sourceConsistencyPropagationPassed.reported) {
      checks.push(
        "horizon_promotion_run_closeout_run_supervised_stage_goal_policy_source_consistency_pass_not_reported",
      );
    } else if (!sourceConsistencyPropagationPassed.pass) {
      checks.push(
        "horizon_promotion_run_closeout_run_supervised_stage_goal_policy_source_consistency_not_passed",
      );
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "rollback-threshold-calibration") {
    const schema = validateManifestSchema("rollback-threshold-calibration", payload);
    const checks = [];
    if (!schema.valid) {
      checks.push(
        ...schema.errors.map((error) => `rollback_threshold_calibration_schema_invalid:${error}`),
      );
    }
    if (payload.pass !== true) {
      checks.push("rollback_threshold_calibration_not_passed");
    }
    const sampleCount = Number(payload?.selection?.selectedSampleCount ?? payload?.samples?.length ?? 0);
    if (!Number.isFinite(sampleCount) || sampleCount < 1) {
      checks.push("rollback_threshold_calibration_samples_missing");
    }
    if (!Array.isArray(payload?.calibration?.recommendedPolicyArgs)) {
      checks.push("rollback_threshold_calibration_policy_args_missing");
    }
    if (
      !payload?.calibration?.recommendedThresholds ||
      typeof payload.calibration.recommendedThresholds !== "object"
    ) {
      checks.push("rollback_threshold_calibration_thresholds_missing");
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "supervised-rollback-simulation") {
    const schema = validateManifestSchema("supervised-rollback-simulation", payload);
    const checks = [];
    if (!schema.valid) {
      checks.push(
        ...schema.errors.map((error) => `supervised_rollback_simulation_schema_invalid:${error}`),
      );
    }
    if (payload.pass !== true) {
      checks.push("supervised_rollback_simulation_not_passed");
    }
    if (payload?.checks?.rollbackTriggered !== true) {
      checks.push("supervised_rollback_not_triggered");
    }
    if (payload?.checks?.rollbackApplied !== true) {
      checks.push("supervised_rollback_not_applied");
    }
    if (payload?.checks?.shadowRestored !== true) {
      checks.push("supervised_rollback_shadow_not_restored");
    }
    if (payload?.checks?.calibrationPass !== true) {
      checks.push("supervised_rollback_calibration_not_passed");
    }
    const stageDrillValidationPropagation = resolveGoalPolicyValidationState(payload, [
      "stageDrillGoalPolicyValidationPropagationPassed",
      "stageDrillGoalPolicyPropagationPassed",
      "stageDrillStageSignalsPass",
      "stageDrillStagePolicySignalsPass",
    ]);
    if (!stageDrillValidationPropagation.reported) {
      checks.push("supervised_rollback_stage_goal_policy_validation_propagation_not_reported");
    } else if (!stageDrillValidationPropagation.pass) {
      checks.push("supervised_rollback_stage_goal_policy_validation_propagation_not_passed");
    }
    const stageDrillSourceConsistencyPropagation = resolveGoalPolicySourceConsistencyState(payload, [
      "stageDrillGoalPolicySourceConsistencyPropagationPassed",
      "stageDrillStageSourceConsistencySignalsPass",
    ]);
    if (!stageDrillSourceConsistencyPropagation.reported) {
      checks.push("supervised_rollback_stage_goal_policy_source_consistency_not_reported");
    } else if (!stageDrillSourceConsistencyPropagation.pass) {
      checks.push("supervised_rollback_stage_goal_policy_source_consistency_not_passed");
    }
    return { pass: checks.length === 0, checks };
  }
  if (verificationType === "initial-scope") {
    const checks = [];
    if (payload.pass !== true) {
      checks.push("initial_scope_not_passed");
    }
    const initialScopeGoalPolicyValidation = resolveInitialScopeGoalPolicyValidationState(payload);
    if (!initialScopeGoalPolicyValidation.reported) {
      checks.push("initial_scope_goal_policy_validation_not_reported");
    } else if (!initialScopeGoalPolicyValidation.pass) {
      checks.push("initial_scope_goal_policy_validation_not_passed");
    }
    const initialScopeGoalPolicySourceConsistency = resolveGoalPolicySourceConsistencyState(payload, [
      "releaseReadinessGoalPolicySourceConsistencyPassed",
      "releaseReadinessGoalPolicySourceConsistencyPass",
    ]);
    if (!initialScopeGoalPolicySourceConsistency.reported) {
      checks.push("initial_scope_goal_policy_source_consistency_not_reported");
    } else if (!initialScopeGoalPolicySourceConsistency.pass) {
      checks.push("initial_scope_goal_policy_source_consistency_not_passed");
    }
    return { pass: checks.length === 0, checks };
  }
  const checks = payload.pass === true ? [] : ["artifact_not_passed"];
  return { pass: checks.length === 0, checks };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const targetHorizon = normalizeHorizon(options.horizon || "H1");
  const horizonIndex = HORIZON_SEQUENCE.indexOf(targetHorizon);
  const derivedNext = horizonIndex >= 0 ? HORIZON_SEQUENCE[horizonIndex + 1] ?? "" : "";
  const nextHorizon = normalizeHorizon(options.nextHorizon || derivedNext);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `horizon-closeout-${targetHorizon || "unknown"}-${stamp}.json`),
  );

  const failures = [];
  if (!(await exists(horizonStatusFile))) {
    failures.push(`missing_horizon_status_file:${horizonStatusFile}`);
  }
  if (!(await exists(evidenceDir))) {
    failures.push(`missing_evidence_dir:${evidenceDir}`);
  }
  if (!targetHorizon) {
    failures.push(`invalid_horizon:${options.horizon || "<empty>"}`);
  }

  let horizonStatus = null;
  let horizonValidation = { valid: false, errors: ["horizon_status_not_loaded"] };
  let requiredEvidenceResults = [];
  let horizonActionResults = [];
  let stagePromotionEvidence = {
    path: null,
    present: false,
    pass: false,
    schemaValid: false,
    schemaErrors: [],
    checks: [],
  };
  let nextHorizonChecks = {
    expectedFromSequence: derivedNext || null,
    selectedNextHorizon: nextHorizon || null,
    nextHorizonStateStatus: null,
    nextHorizonExpectedStage: null,
    promotionTargetStage: null,
    activeMatchesNextHorizon: false,
  };

  if (await exists(horizonStatusFile)) {
    horizonStatus = await readJson(horizonStatusFile);
    horizonValidation = validateHorizonStatus(horizonStatus);
    if (!horizonValidation.valid) {
      failures.push(...horizonValidation.errors.map((error) => `horizon_status_invalid:${error}`));
    }
  }

  if (horizonStatus && targetHorizon) {
    const horizonState = horizonStatus?.horizonStates?.[targetHorizon];
    if (!horizonState || typeof horizonState !== "object") {
      failures.push(`missing_horizon_state:${targetHorizon}`);
    }

    const stagePromotionPath = await newestFileInDir(
      evidenceDir,
      "stage-promotion-readiness-",
    );
    if (!isNonEmptyString(stagePromotionPath)) {
      stagePromotionEvidence.checks.push("missing_stage_promotion_artifact");
      failures.push("missing_stage_promotion_readiness_artifact");
    } else {
      stagePromotionEvidence.path = stagePromotionPath;
      stagePromotionEvidence.present = true;
      const stagePromotionPayload = await readJson(stagePromotionPath);
      const stagePromotionSchema = validateManifestSchema(
        "stage-promotion-readiness",
        stagePromotionPayload,
      );
      stagePromotionEvidence.schemaValid = stagePromotionSchema.valid;
      stagePromotionEvidence.schemaErrors = stagePromotionSchema.valid
        ? []
        : [...stagePromotionSchema.errors];
      if (!stagePromotionSchema.valid) {
        stagePromotionEvidence.pass = false;
        stagePromotionEvidence.checks.push(
          ...stagePromotionSchema.errors.map((error) => `stage_promotion_schema_invalid:${error}`),
        );
        failures.push("stage_promotion_schema_invalid");
      }
      if (stagePromotionPayload?.pass === true) {
        // Preserve fail-closed schema verdict even if payload.pass is true.
        stagePromotionEvidence.pass = stagePromotionEvidence.schemaValid;
        const stagePromotionGoalPolicySignals = resolveStagePromotionGoalPolicySignals(
          stagePromotionPayload,
        );
        if (!stagePromotionGoalPolicySignals.propagationReported) {
          stagePromotionEvidence.pass = false;
          stagePromotionEvidence.checks.push("stage_promotion_goal_policy_source_consistency_not_reported");
          failures.push("stage_promotion_goal_policy_source_consistency_not_reported");
        } else if (!stagePromotionGoalPolicySignals.propagationPassed) {
          stagePromotionEvidence.pass = false;
          stagePromotionEvidence.checks.push("stage_promotion_goal_policy_source_consistency_not_passed");
          failures.push("stage_promotion_goal_policy_source_consistency_not_passed");
        }
      } else {
        stagePromotionEvidence.checks.push("stage_promotion_not_passed");
        failures.push("stage_promotion_readiness_not_passed");
      }
    }

    const targetActions = Array.isArray(horizonStatus.nextActions)
      ? horizonStatus.nextActions.filter(
          (action) => action && typeof action === "object" && action.targetHorizon === targetHorizon,
        )
      : [];
    if (targetActions.length === 0) {
      failures.push(`missing_next_actions_for_horizon:${targetHorizon}`);
    }
    horizonActionResults = targetActions.map((action) => ({
      id: String(action.id ?? ""),
      status: String(action.status ?? ""),
      summary: String(action.summary ?? ""),
      completed: String(action.status ?? "") === "completed",
    }));
    if (options.requireCompletedActions) {
      for (const action of horizonActionResults) {
        if (!action.completed) {
          failures.push(`incomplete_horizon_action:${action.id || "<unknown>"}`);
        }
      }
    }

    const evidenceFiles = await listTopLevelFiles(evidenceDir);
    const requiredEvidence = Array.isArray(horizonStatus.requiredEvidence)
      ? horizonStatus.requiredEvidence.filter(
          (entry) =>
            entry &&
            typeof entry === "object" &&
            entry.required === true &&
            evidenceEntryAppliesToHorizon(entry, targetHorizon),
        )
      : [];
    requiredEvidenceResults = [];
    for (const entry of requiredEvidence) {
      const artifactPattern = String(entry.artifactPattern ?? "");
      const command = String(entry.command ?? "");
      const id = String(entry.id ?? "");
      const matches = evidenceFiles
        .filter((filePath) => matchArtifactPattern(artifactPattern, filePath, evidenceDir))
        .sort();
      const result = {
        id,
        command,
        artifactPattern,
        matchedPath: null,
        present: false,
        pass: false,
        checks: [],
      };
      if (matches.length === 0) {
        result.checks.push("missing_artifact_match");
      } else {
        const inspectedMatches = [];
        for (const matchPath of matches) {
          const payload = await readJson(matchPath);
          const evaluation = evaluateCommandPayload(command, payload, targetHorizon);
          inspectedMatches.push({
            path: matchPath,
            payload,
            pass: evaluation.pass,
            checks: evaluation.checks,
          });
        }
        const orderedMatches = sortByGeneratedAtDesc(inspectedMatches);
        const passingEntry = orderedMatches.find((entry) => entry.pass === true);
        const selectedEntry = passingEntry ?? orderedMatches[0];
        result.matchedPath = selectedEntry?.path ?? null;
        result.present = Boolean(selectedEntry);
        result.pass = Boolean(selectedEntry?.pass);
        if (selectedEntry && Array.isArray(selectedEntry.checks)) {
          result.checks.push(...selectedEntry.checks);
        }
      }
      if (!result.present) {
        failures.push(`missing_required_evidence:${id || command || artifactPattern}`);
      } else if (!result.pass) {
        failures.push(`required_evidence_failed:${id || command || artifactPattern}`);
      }
      requiredEvidenceResults.push(result);
    }

    const expectedNextFromSequence = derivedNext;
    if (expectedNextFromSequence && nextHorizon && expectedNextFromSequence !== nextHorizon) {
      failures.push(`next_horizon_mismatch:${nextHorizon}!=${expectedNextFromSequence}`);
    }
    const nextState = nextHorizon ? horizonStatus?.horizonStates?.[nextHorizon] : null;
    if (nextHorizon && (!nextState || typeof nextState !== "object")) {
      failures.push(`missing_next_horizon_state:${nextHorizon}`);
    }
    const nextExpectedStage = nextHorizon ? HORIZON_STAGE_MAP[nextHorizon] ?? null : null;
    const promotionTarget = String(horizonStatus?.promotionReadiness?.targetStage ?? "").trim().toLowerCase() || null;
    if (
      !options.allowHorizonMismatch &&
      nextExpectedStage &&
      promotionTarget &&
      promotionTarget !== nextExpectedStage
    ) {
      failures.push(`promotion_target_stage_mismatch:${promotionTarget}!=${nextExpectedStage}`);
    }
    const activeMatchesNext =
      Boolean(nextHorizon) &&
      horizonStatus.activeHorizon === nextHorizon &&
      horizonStatus.activeStatus === nextState?.status;
    if (options.requireActiveNextHorizon && !activeMatchesNext) {
      failures.push(`active_horizon_not_next:${String(horizonStatus.activeHorizon ?? "<unknown>")}`);
    }
    nextHorizonChecks = {
      expectedFromSequence: expectedNextFromSequence || null,
      selectedNextHorizon: nextHorizon || null,
      nextHorizonStateStatus: typeof nextState?.status === "string" ? nextState.status : null,
      nextHorizonExpectedStage: nextExpectedStage,
      promotionTargetStage: promotionTarget,
      activeMatchesNextHorizon: activeMatchesNext,
    };
  }

  let h5EvidenceBundleGate = null;
  if (
    targetHorizon === "H5"
    && options.requireH5EvidenceBundle
    && (await exists(evidenceDir))
  ) {
    h5EvidenceBundleGate = await runH5EvidenceBundleGate(horizonStatusFile, evidenceDir);
    if (!h5EvidenceBundleGate.pass) {
      failures.push("h5_evidence_bundle_gate_failed");
    }
  }

  let h6EvidenceBundleGate = null;
  if (
    targetHorizon === "H6"
    && options.requireH6EvidenceBundle
    && (await exists(evidenceDir))
  ) {
    h6EvidenceBundleGate = await runH6EvidenceBundleGate(horizonStatusFile, evidenceDir);
    if (!h6EvidenceBundleGate.pass) {
      failures.push("h6_evidence_bundle_gate_failed");
    }
  }

  let h7EvidenceBundleGate = null;
  if (
    targetHorizon === "H7"
    && options.requireH7EvidenceBundle
    && (await exists(evidenceDir))
  ) {
    h7EvidenceBundleGate = await runH7EvidenceBundleGate(horizonStatusFile, evidenceDir);
    if (!h7EvidenceBundleGate.pass) {
      failures.push("h7_evidence_bundle_gate_failed");
    }
  }

  let h8EvidenceBundleGate = null;
  if (
    targetHorizon === "H8"
    && options.requireH8EvidenceBundle
    && (await exists(evidenceDir))
  ) {
    h8EvidenceBundleGate = await runH8EvidenceBundleGate(horizonStatusFile, evidenceDir);
    if (!h8EvidenceBundleGate.pass) {
      failures.push("h8_evidence_bundle_gate_failed");
    }
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    closeout: {
      horizon: targetHorizon || null,
      nextHorizon: nextHorizon || null,
      canCloseHorizon: failures.length === 0,
      canStartNextHorizon:
        failures.length === 0 && nextHorizonChecks.activeMatchesNextHorizon === true,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      outPath,
    },
    checks: {
      horizonValidationPass: horizonValidation.valid,
      horizonStatusValid: horizonValidation.valid,
      releaseReadinessPassed: requiredEvidenceResults.some(
        (item) => item.command === "npm run validate:release-readiness" && item.pass === true,
      ),
      releaseReadinessGoalPolicyValidationReported: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run validate:release-readiness"
          && item.pass === true
          && !item.checks.includes("release_goal_policy_validation_not_reported"),
      ),
      releaseReadinessGoalPolicyValidationPassed: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run validate:release-readiness"
          && item.pass === true
          && !item.checks.includes("release_goal_policy_validation_not_passed"),
      ),
      releaseReadinessGoalPolicySourceConsistencyReported: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run validate:release-readiness"
          && item.pass === true
          && !item.checks.includes("release_goal_policy_source_consistency_not_reported"),
      ),
      releaseReadinessGoalPolicySourceConsistencyPassed: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run validate:release-readiness"
          && item.pass === true
          && !item.checks.includes("release_goal_policy_source_consistency_not_passed"),
      ),
      bundleVerificationSelectionProvenanceReported: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run verify:merge-bundle"
          && item.pass === true
          && !item.checks.includes("bundle_verify_selection_proof_not_reported")
          && !item.checks.includes("bundle_verify_validation_manifest_path_not_reported"),
      ),
      bundleVerificationSelectionProvenancePassed: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run verify:merge-bundle"
          && item.pass === true
          && !item.checks.includes("bundle_verify_selection_proof_not_passed")
          && !item.checks.includes("bundle_verify_selection_gate_not_passed"),
      ),
      mergeBundleGoalPolicySourceConsistencyReported: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run validate:merge-bundle"
          && item.pass === true
          && !item.checks.includes("merge_bundle_release_goal_policy_source_consistency_not_reported")
          && !item.checks.includes("merge_bundle_initial_scope_goal_policy_source_consistency_not_reported"),
      ),
      mergeBundleGoalPolicySourceConsistencyPassed: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run validate:merge-bundle"
          && item.pass === true
          && !item.checks.includes("merge_bundle_release_goal_policy_source_consistency_not_passed")
          && !item.checks.includes("merge_bundle_initial_scope_goal_policy_source_consistency_not_passed"),
      ),
      bundleVerificationGoalPolicySourceConsistencyReported: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run verify:merge-bundle"
          && item.pass === true
          && !item.checks.includes("bundle_verify_release_goal_policy_source_consistency_not_reported")
          && !item.checks.includes("bundle_verify_initial_scope_goal_policy_source_consistency_not_reported"),
      ),
      bundleVerificationGoalPolicySourceConsistencyPassed: requiredEvidenceResults.some(
        (item) =>
          item.command === "npm run verify:merge-bundle"
          && item.pass === true
          && !item.checks.includes("bundle_verify_release_goal_policy_source_consistency_not_passed")
          && !item.checks.includes("bundle_verify_initial_scope_goal_policy_source_consistency_not_passed"),
      ),
      stagePromotionPassed: stagePromotionEvidence.pass,
      stagePromotionSchemaValid: stagePromotionEvidence.schemaValid,
      stagePromotionSchemaErrors:
        stagePromotionEvidence.schemaValid || stagePromotionEvidence.schemaErrors.length === 0
          ? null
          : stagePromotionEvidence.schemaErrors,
      stagePromotionGoalPolicySourceConsistencyReported:
        !stagePromotionEvidence.checks.includes(
          "stage_promotion_goal_policy_source_consistency_not_reported",
        ),
      stagePromotionGoalPolicySourceConsistencyPassed:
        !stagePromotionEvidence.checks.includes(
          "stage_promotion_goal_policy_source_consistency_not_passed",
        ),
      stagePromotionEvidence,
      nextActions: horizonActionResults,
      requiredEvidence: requiredEvidenceResults,
      nextHorizon: nextHorizonChecks,
      h5EvidenceBundleGate,
      h6EvidenceBundleGate,
      h7EvidenceBundleGate,
      h8EvidenceBundleGate,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Horizon closeout validation failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
