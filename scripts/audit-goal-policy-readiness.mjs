#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";
import { loadGoalPolicyTransitions } from "./goal-policy-source.mjs";

const HORIZON_SEQUENCE = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8", "H9", "H10", "H11", "H12", "H13", "H14", "H15", "H16", "H17", "H18", "H19", "H20", "H21", "H22", "H23", "H24", "H25", "H26", "H27", "H28", "H29"];

function parseArgs(argv) {
  const options = {
    horizonStatusFile: "",
    goalPolicyFile: "",
    sourceHorizon: "",
    maxTargetHorizon: "H12",
    out: "",
    requireTaggedRequirements: true,
    requirePositivePendingMin: false,
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
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--require-tagged-requirements") {
      options.requireTaggedRequirements = true;
    } else if (arg === "--allow-untagged-requirements") {
      options.requireTaggedRequirements = false;
    } else if (arg === "--require-positive-pending-min") {
      options.requirePositivePendingMin = true;
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

function normalizeTaggedRequirements(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const normalized = {};
  for (const [tag, requirement] of Object.entries(value)) {
    if (!isNonEmptyString(tag)) {
      return null;
    }
    if (isNonNegativeInteger(requirement)) {
      normalized[tag] = { minCount: Number(requirement), minPendingCount: 0 };
      continue;
    }
    if (requirement && typeof requirement === "object" && !Array.isArray(requirement)) {
      const minCount = Number(requirement.minCount ?? 0);
      const minPendingCount = Number(requirement.minPendingCount ?? 0);
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
  const goalPolicyFile = isNonEmptyString(options.goalPolicyFile)
    ? path.resolve(options.goalPolicyFile)
    : "";
  const horizonStatus = JSON.parse(await readFile(horizonStatusFile, "utf8"));
  const validation = validateHorizonStatus(horizonStatus);
  const policySource = await loadGoalPolicyTransitions({
    horizonStatus,
    horizonStatusFile,
    goalPolicyFile,
    requireGoalPolicySourceConsistency: true,
  });

  const sourceHorizon = normalizeHorizon(options.sourceHorizon, horizonStatus?.activeHorizon ?? "");
  const maxTargetHorizon = normalizeHorizon(options.maxTargetHorizon, "H12");
  const transitions = buildTransitions(sourceHorizon, maxTargetHorizon);

  const outPath = path.resolve(
    options.out ||
      path.join(
        process.cwd(),
        "evidence",
        `goal-policy-readiness-audit-${sourceHorizon || "unknown"}-to-${maxTargetHorizon || "unknown"}-${stamp()}.json`,
      ),
  );

  const failures = [];
  if (!validation.valid) {
    failures.push(...validation.errors.map((error) => `horizon_status_invalid:${error}`));
  }
  if (!policySource.ok) {
    failures.push(`goal_policy_source_error:${policySource.reason}`);
  } else if (policySource.fromFile && policySource.valid !== true) {
    failures.push(...policySource.errors.map((error) => `goal_policy_file_invalid:${error}`));
  }
  if (!sourceHorizon) {
    failures.push(`invalid_source_horizon:${String(options.sourceHorizon ?? "<empty>")}`);
  }
  if (!maxTargetHorizon) {
    failures.push(`invalid_max_target_horizon:${String(options.maxTargetHorizon ?? "<empty>")}`);
  }
  if (transitions.length === 0) {
    failures.push(`invalid_transition_window:${sourceHorizon}->${maxTargetHorizon}`);
  }

  const transitionsContainer = policySource.transitions;
  const matrix = {};
  for (const transitionKey of transitions) {
    const policy = transitionsContainer?.[transitionKey];
    const row = {
      transitionKey,
      present: Boolean(policy && typeof policy === "object" && !Array.isArray(policy)),
      minimumGoalIncrease: null,
      minActionGrowthFactor: null,
      minPendingNextActions: null,
      taggedRequirements: {},
      taggedRequirementCount: 0,
      pass: false,
      failures: [],
    };

    if (!row.present) {
      row.failures.push(`missing_transition_policy:${transitionKey}`);
      matrix[transitionKey] = row;
      failures.push(...row.failures);
      continue;
    }

    const minimumGoalIncrease = Number(policy.minimumGoalIncrease ?? 0);
    if (!isNonNegativeInteger(minimumGoalIncrease)) {
      row.failures.push(`invalid_minimum_goal_increase:${transitionKey}`);
    } else {
      row.minimumGoalIncrease = minimumGoalIncrease;
    }

    const minActionGrowthFactor = Number(policy.minActionGrowthFactor ?? 0);
    if (!(Number.isFinite(minActionGrowthFactor) && minActionGrowthFactor > 0)) {
      row.failures.push(`invalid_min_action_growth_factor:${transitionKey}`);
    } else {
      row.minActionGrowthFactor = minActionGrowthFactor;
    }

    const minPendingNextActions = Number(policy.minPendingNextActions ?? 0);
    if (!isNonNegativeInteger(minPendingNextActions)) {
      row.failures.push(`invalid_min_pending_next_actions:${transitionKey}`);
    } else {
      row.minPendingNextActions = minPendingNextActions;
      if (options.requirePositivePendingMin && minPendingNextActions <= 0) {
        row.failures.push(`pending_min_not_positive:${transitionKey}`);
      }
    }

    const taggedRequirements = normalizeTaggedRequirements(policy.requiredTaggedActionCounts);
    if (taggedRequirements === null) {
      row.failures.push(`missing_or_invalid_required_tagged_action_counts:${transitionKey}`);
    } else {
      row.taggedRequirements = taggedRequirements;
      row.taggedRequirementCount = Object.keys(taggedRequirements).length;
      if (options.requireTaggedRequirements && row.taggedRequirementCount === 0) {
        row.failures.push(`missing_tagged_requirements:${transitionKey}`);
      }
    }

    row.pass = row.failures.length === 0;
    if (!row.pass) {
      failures.push(...row.failures);
    }
    matrix[transitionKey] = row;
  }

  const passingTransitions = Object.values(matrix).filter((row) => row.pass === true).length;
  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    files: {
      horizonStatusFile,
      goalPolicyFile: policySource.goalPolicyFile,
      goalPolicySource: policySource.source,
      outPath,
    },
    horizons: {
      source: sourceHorizon || null,
      maxTarget: maxTargetHorizon || null,
    },
    checks: {
      transitionCount: transitions.length,
      passingTransitionCount: passingTransitions,
      coverageRate: transitions.length > 0 ? passingTransitions / transitions.length : 0,
      requireTaggedRequirements: options.requireTaggedRequirements,
      requirePositivePendingMin: options.requirePositivePendingMin,
      goalPolicySource: policySource.source,
      matrix,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Goal policy readiness audit failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
