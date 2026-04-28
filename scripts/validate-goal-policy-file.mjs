#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";
import { loadGoalPolicyTransitions, validateGoalPolicySourceOption } from "./goal-policy-source.mjs";

const HORIZON_SEQUENCE = ["H1", "H2", "H3", "H4", "H5"];

function parseArgs(argv) {
  const options = {
    horizonStatusFile: "",
    goalPolicyFile: "",
    sourceHorizon: "",
    maxTargetHorizon: "H5",
    requiredPolicyTransitions: "",
    out: "",
    requireTaggedRequirements: true,
    requirePositivePendingMin: true,
    allowFallbackSource: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--goal-policy-file") {
      options.goalPolicyFile = value ?? "";
      index += 1;
    } else if (arg === "--source-horizon") {
      options.sourceHorizon = value ?? "";
      index += 1;
    } else if (arg === "--max-target-horizon" || arg === "--until-horizon") {
      options.maxTargetHorizon = value ?? "";
      index += 1;
    } else if (arg === "--required-policy-transitions") {
      options.requiredPolicyTransitions = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--allow-untagged-requirements") {
      options.requireTaggedRequirements = false;
    } else if (arg === "--allow-zero-pending-min") {
      options.requirePositivePendingMin = false;
    } else if (arg === "--allow-fallback-source") {
      options.allowFallbackSource = true;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeHorizon(value, fallback = "") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return HORIZON_SEQUENCE.includes(normalized) ? normalized : fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function buildTransitions(sourceHorizon, maxTargetHorizon) {
  const sourceIndex = HORIZON_SEQUENCE.indexOf(sourceHorizon);
  const targetIndex = HORIZON_SEQUENCE.indexOf(maxTargetHorizon);
  if (sourceIndex < 0 || targetIndex < 0 || targetIndex <= sourceIndex) {
    return [];
  }
  const transitions = [];
  for (let index = sourceIndex; index < targetIndex; index += 1) {
    transitions.push(`${HORIZON_SEQUENCE[index]}->${HORIZON_SEQUENCE[index + 1]}`);
  }
  return transitions;
}

function parseRequiredTransitions(rawValue) {
  if (!isNonEmptyString(rawValue)) {
    return [];
  }
  return rawValue
    .split(",")
    .map((item) => String(item ?? "").trim())
    .filter((item) => item.length > 0);
}

function normalizeTagRequirements(rawValue) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null;
  }
  const normalized = {};
  for (const [tag, rawRequirement] of Object.entries(rawValue)) {
    if (!isNonEmptyString(tag)) {
      return null;
    }
    if (isNonNegativeInteger(rawRequirement)) {
      normalized[tag] = { minCount: Number(rawRequirement), minPendingCount: 0 };
      continue;
    }
    if (rawRequirement && typeof rawRequirement === "object" && !Array.isArray(rawRequirement)) {
      const minCount = Number(rawRequirement.minCount ?? 0);
      const minPendingCount = Number(rawRequirement.minPendingCount ?? 0);
      if (!isNonNegativeInteger(minCount) || !isNonNegativeInteger(minPendingCount)) {
        return null;
      }
      normalized[tag] = { minCount, minPendingCount };
      continue;
    }
    return null;
  }
  return normalized;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const horizonStatus = JSON.parse(await readFile(horizonStatusFile, "utf8"));
  const statusValidation = validateHorizonStatus(horizonStatus);

  const sourceHorizon = normalizeHorizon(options.sourceHorizon, horizonStatus?.activeHorizon ?? "");
  const maxTargetHorizon = normalizeHorizon(options.maxTargetHorizon, "H5");
  const windowTransitions = buildTransitions(sourceHorizon, maxTargetHorizon);
  const requiredPolicyTransitions = parseRequiredTransitions(options.requiredPolicyTransitions);
  const transitions = requiredPolicyTransitions.length > 0 ? requiredPolicyTransitions : windowTransitions;
  const goalPolicySourceValidation = validateGoalPolicySourceOption(options.goalPolicyFile);

  const policySource = await loadGoalPolicyTransitions({
    horizonStatus,
    horizonStatusFile,
    goalPolicyFile: options.goalPolicyFile,
  });

  const outPath = path.resolve(
    options.out ||
      path.join(
        process.cwd(),
        "evidence",
        `goal-policy-file-validation-${sourceHorizon || "unknown"}-to-${maxTargetHorizon || "unknown"}-${stamp()}.json`,
      ),
  );

  const failures = [];
  if (!statusValidation.valid) {
    failures.push(...statusValidation.errors.map((error) => `horizon_status_invalid:${error}`));
  }
  if (!goalPolicySourceValidation.valid) {
    failures.push(...goalPolicySourceValidation.errors);
  }
  if (!policySource.ok) {
    failures.push(...policySource.errors.map((error) => `goal_policy_source_invalid:${error}`));
  }
  if (!options.allowFallbackSource && policySource.source !== "file") {
    failures.push(`goal_policy_source_not_file:${String(policySource.source ?? "unknown")}`);
  }
  if (requiredPolicyTransitions.length === 0 && !sourceHorizon) {
    failures.push(`invalid_source_horizon:${String(options.sourceHorizon ?? "<empty>")}`);
  }
  if (requiredPolicyTransitions.length === 0 && !maxTargetHorizon) {
    failures.push(`invalid_max_target_horizon:${String(options.maxTargetHorizon ?? "<empty>")}`);
  }
  if (transitions.length === 0) {
    failures.push(`invalid_transition_window:${sourceHorizon}->${maxTargetHorizon}`);
  }

  const transitionChecks = {};
  for (const transitionKey of transitions) {
    const policy = policySource.transitions?.[transitionKey];
    const policyCheck = {
      transitionKey,
      present: Boolean(policy && typeof policy === "object" && !Array.isArray(policy)),
      minimumGoalIncrease: null,
      minActionGrowthFactor: null,
      minPendingNextActions: null,
      hasTaggedRequirements: false,
      taggedRequirements: {},
      valid: false,
      failures: [],
    };
    if (!policyCheck.present) {
      policyCheck.failures.push(`missing_transition_policy:${transitionKey}`);
      transitionChecks[transitionKey] = policyCheck;
      failures.push(`missing_transition_policy:${transitionKey}`);
      continue;
    }

    const minimumGoalIncrease = Number(policy.minimumGoalIncrease ?? 0);
    if (!isNonNegativeInteger(minimumGoalIncrease)) {
      policyCheck.failures.push(`invalid_minimum_goal_increase:${transitionKey}`);
    } else {
      policyCheck.minimumGoalIncrease = minimumGoalIncrease;
    }

    const minActionGrowthFactor = Number(policy.minActionGrowthFactor ?? 0);
    if (!(Number.isFinite(minActionGrowthFactor) && minActionGrowthFactor > 0)) {
      policyCheck.failures.push(`invalid_min_action_growth_factor:${transitionKey}`);
    } else {
      policyCheck.minActionGrowthFactor = minActionGrowthFactor;
    }

    const minPendingNextActions = Number(policy.minPendingNextActions ?? 0);
    if (!isNonNegativeInteger(minPendingNextActions)) {
      policyCheck.failures.push(`invalid_min_pending_next_actions:${transitionKey}`);
    } else {
      policyCheck.minPendingNextActions = minPendingNextActions;
      if (options.requirePositivePendingMin && minPendingNextActions <= 0) {
        policyCheck.failures.push(`pending_min_not_positive:${transitionKey}`);
      }
    }

    const normalizedTagRequirements = normalizeTagRequirements(policy.requiredTaggedActionCounts);
    if (normalizedTagRequirements === null) {
      policyCheck.failures.push(`invalid_required_tagged_action_counts:${transitionKey}`);
    } else {
      policyCheck.taggedRequirements = normalizedTagRequirements;
      policyCheck.hasTaggedRequirements = Object.keys(normalizedTagRequirements).length > 0;
      if (options.requireTaggedRequirements && !policyCheck.hasTaggedRequirements) {
        policyCheck.failures.push(`missing_tagged_requirements:${transitionKey}`);
      }
    }

    if (policyCheck.failures.length > 0) {
      failures.push(...policyCheck.failures);
    }
    policyCheck.valid = policyCheck.failures.length === 0;
    transitionChecks[transitionKey] = policyCheck;
  }

  const missingTransitions = Object.values(transitionChecks)
    .filter((check) => check.present === false)
    .map((check) => check.transitionKey);
  const coverageRate = transitions.length > 0 ? (transitions.length - missingTransitions.length) / transitions.length : 0;

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    files: {
      horizonStatusFile,
      goalPolicySource: policySource.source,
      goalPolicySourceSelection: policySource.sourceSelection ?? null,
      goalPolicyFile: policySource.goalPolicyFile,
      outPath,
    },
    horizons: {
      source: sourceHorizon || null,
      maxTarget: maxTargetHorizon || null,
    },
    checks: {
      transitionCount: transitions.length,
      transitionKeys: transitions,
      requiredPolicyTransitions,
      coverageRate,
      missingTransitions,
      sourceWasFile: policySource.source === "file",
      sourceSelection: policySource.sourceSelection ?? null,
      coveragePass: transitions.length > 0 && missingTransitions.length === 0,
      allowFallbackSource: options.allowFallbackSource,
      requireTaggedRequirements: options.requireTaggedRequirements,
      requirePositivePendingMin: options.requirePositivePendingMin,
      transitions: transitionChecks,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Goal policy file validation failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
