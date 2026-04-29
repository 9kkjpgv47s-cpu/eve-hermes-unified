#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectDuplicateTransitionKeysFromRawJson } from "./goal-policy-source.mjs";

const VALID_HORIZONS = [
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "H7",
  "H8",
  "H9",
  "H10",
  "H11",
  "H12",
  "H13",
  "H14",
  "H15",
  "H16",
  "H17",
  "H18",
  "H19",
];
const VALID_STATUSES = ["planned", "in_progress", "blocked", "completed"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];
const VALID_STAGES = ["shadow", "canary", "majority", "full"];
const ACTION_TAG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const REQUIRED_GATE_COMMANDS = {
  releaseReadinessPass: "npm run validate:release-readiness",
  mergeBundlePass: "npm run validate:merge-bundle",
  bundleVerificationPass: "npm run verify:merge-bundle",
  cutoverReadinessPass: "npm run validate:cutover-readiness",
  evidenceSummaryPass: "npm run validate:evidence-summary",
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStatusId(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizeHorizonId(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isValidActionTag(value) {
  return ACTION_TAG_PATTERN.test(String(value ?? "").trim());
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function parseArgs(argv) {
  const options = {
    file: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--file") {
      options.file = value ?? "";
      index += 1;
    }
  }
  return options;
}

export function validateHorizonStatus(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object") {
    return { valid: false, errors: ["payload must be an object"] };
  }

  if (payload.schemaVersion !== "v1") {
    errors.push("schemaVersion must be v1");
  }
  if (!isNonEmptyString(payload.updatedAtIso)) {
    errors.push("updatedAtIso must be non-empty string");
  }
  if (!isNonEmptyString(payload.owner)) {
    errors.push("owner must be non-empty string");
  }
  if (!VALID_HORIZONS.includes(String(payload.activeHorizon))) {
    errors.push(`activeHorizon must be one of: ${VALID_HORIZONS.join(", ")}`);
  }
  if (!VALID_STATUSES.includes(String(payload.activeStatus))) {
    errors.push(`activeStatus must be one of: ${VALID_STATUSES.join(", ")}`);
  }
  if (!Array.isArray(payload.blockers)) {
    errors.push("blockers must be an array");
  }
  if (!Array.isArray(payload.requiredEvidence)) {
    errors.push("requiredEvidence must be an array");
  }
  if (!Array.isArray(payload.nextActions)) {
    errors.push("nextActions must be an array");
  }
  if (!payload.horizonStates || typeof payload.horizonStates !== "object") {
    errors.push("horizonStates must be an object");
  }
  if (!Array.isArray(payload.history)) {
    errors.push("history must be an array");
  }
  if (!payload.promotionReadiness || typeof payload.promotionReadiness !== "object") {
    errors.push("promotionReadiness must be an object");
  }

  if (payload.blockers && Array.isArray(payload.blockers)) {
    payload.blockers.forEach((item, index) => {
      const prefix = `blockers[${String(index)}]`;
      if (!item || typeof item !== "object") {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (!isNonEmptyString(item.id)) {
        errors.push(`${prefix}.id must be non-empty string`);
      }
      if (!isNonEmptyString(item.summary)) {
        errors.push(`${prefix}.summary must be non-empty string`);
      }
      if (!VALID_SEVERITIES.includes(String(item.severity))) {
        errors.push(`${prefix}.severity must be one of: ${VALID_SEVERITIES.join(", ")}`);
      }
      if (!isNonEmptyString(item.mitigation)) {
        errors.push(`${prefix}.mitigation must be non-empty string`);
      }
    });
  }

  if (payload.requiredEvidence && Array.isArray(payload.requiredEvidence)) {
    payload.requiredEvidence.forEach((item, index) => {
      const prefix = `requiredEvidence[${String(index)}]`;
      if (!item || typeof item !== "object") {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (!isNonEmptyString(item.id)) {
        errors.push(`${prefix}.id must be non-empty string`);
      }
      if (!isNonEmptyString(item.command)) {
        errors.push(`${prefix}.command must be non-empty string`);
      }
      if (!isNonEmptyString(item.artifactPattern)) {
        errors.push(`${prefix}.artifactPattern must be non-empty string`);
      }
      if (typeof item.required !== "boolean") {
        errors.push(`${prefix}.required must be boolean`);
      }
      if (item.horizons !== undefined) {
        if (!Array.isArray(item.horizons) || item.horizons.length === 0) {
          errors.push(`${prefix}.horizons must be a non-empty array when provided`);
        } else {
          for (const [horizonIndex, horizonValue] of item.horizons.entries()) {
            const normalizedHorizon = normalizeHorizonId(horizonValue);
            if (!VALID_HORIZONS.includes(normalizedHorizon)) {
              errors.push(
                `${prefix}.horizons[${String(horizonIndex)}] must be one of: ${VALID_HORIZONS.join(", ")}`,
              );
            }
          }
        }
      }
    });
  }

  if (payload.promotionReadiness && typeof payload.promotionReadiness === "object") {
    const promotion = payload.promotionReadiness;
    const normalizedTarget = String(promotion.targetStage ?? "").trim().toLowerCase();
    if (!VALID_STAGES.includes(normalizedTarget)) {
      errors.push(`promotionReadiness.targetStage must be one of: ${VALID_STAGES.join(", ")}`);
    }
    if (!promotion.gates || typeof promotion.gates !== "object") {
      errors.push("promotionReadiness.gates must be an object");
    } else {
      for (const gateKey of Object.keys(REQUIRED_GATE_COMMANDS)) {
        if (typeof promotion.gates[gateKey] !== "boolean") {
          errors.push(`promotionReadiness.gates.${gateKey} must be boolean`);
        }
      }
    }
  }

  if (Array.isArray(payload.nextActions) && payload.nextActions.length === 0) {
    errors.push("nextActions must contain at least one action");
  }

  if (payload.nextActions && Array.isArray(payload.nextActions)) {
    payload.nextActions.forEach((item, index) => {
      const prefix = `nextActions[${String(index)}]`;
      if (!item || typeof item !== "object") {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (!isNonEmptyString(item.id)) {
        errors.push(`${prefix}.id must be non-empty string`);
      }
      if (!isNonEmptyString(item.summary)) {
        errors.push(`${prefix}.summary must be non-empty string`);
      }
      if (!isNonEmptyString(item.targetHorizon)) {
        errors.push(`${prefix}.targetHorizon must be non-empty string`);
      }
      if (!isNonEmptyString(item.status)) {
        errors.push(`${prefix}.status must be non-empty string`);
      }
      if (!VALID_STATUSES.includes(String(item.status))) {
        errors.push(`${prefix}.status must be one of: ${VALID_STATUSES.join(", ")}`);
      }
      if (item.tags !== undefined) {
        if (!Array.isArray(item.tags) || item.tags.length === 0) {
          errors.push(`${prefix}.tags must be a non-empty array when provided`);
        } else {
          const dedupe = new Set();
          item.tags.forEach((tagValue, tagIndex) => {
            const normalizedTag = String(tagValue ?? "").trim();
            if (!isValidActionTag(normalizedTag)) {
              errors.push(
                `${prefix}.tags[${String(tagIndex)}] must match ${ACTION_TAG_PATTERN.toString()}`,
              );
            }
            if (dedupe.has(normalizedTag)) {
              errors.push(`${prefix}.tags contains duplicate value: ${normalizedTag}`);
            }
            dedupe.add(normalizedTag);
          });
        }
      }
    });
  }

  if (payload.goalPolicies !== undefined) {
    if (!payload.goalPolicies || typeof payload.goalPolicies !== "object" || Array.isArray(payload.goalPolicies)) {
      errors.push("goalPolicies must be an object when provided");
    } else {
      const policyContainer =
        payload.goalPolicies.transitions &&
        typeof payload.goalPolicies.transitions === "object" &&
        !Array.isArray(payload.goalPolicies.transitions)
          ? payload.goalPolicies.transitions
          : payload.goalPolicies;

      for (const [policyKey, policyValue] of Object.entries(policyContainer)) {
        const basePrefix =
          policyContainer === payload.goalPolicies
            ? `goalPolicies.${policyKey}`
            : `goalPolicies.transitions.${policyKey}`;
        if (policyKey === "transitions" && policyContainer === payload.goalPolicies) {
          continue;
        }
        if (!/^H(1[0-9]|[1-9])->H(1[0-9]|[1-9])$/.test(policyKey)) {
          errors.push(`${basePrefix} key must match pattern H<1-19>->H<1-19>`);
        }
        if (!policyValue || typeof policyValue !== "object" || Array.isArray(policyValue)) {
          errors.push(`${basePrefix} must be an object`);
          continue;
        }
        if (
          policyValue.minimumGoalIncrease !== undefined &&
          !isNonNegativeInteger(policyValue.minimumGoalIncrease)
        ) {
          errors.push(`${basePrefix}.minimumGoalIncrease must be a non-negative integer when provided`);
        }
        if (
          policyValue.minPendingNextActions !== undefined &&
          !isNonNegativeInteger(policyValue.minPendingNextActions)
        ) {
          errors.push(
            `${basePrefix}.minPendingNextActions must be a non-negative integer when provided`,
          );
        }
        if (
          policyValue.minActionGrowthFactor !== undefined &&
          !(Number.isFinite(policyValue.minActionGrowthFactor) && policyValue.minActionGrowthFactor > 0)
        ) {
          errors.push(`${basePrefix}.minActionGrowthFactor must be a positive number when provided`);
        }

        const taggedCounts =
          policyValue.requiredTaggedActionCounts &&
          typeof policyValue.requiredTaggedActionCounts === "object" &&
          !Array.isArray(policyValue.requiredTaggedActionCounts)
            ? policyValue.requiredTaggedActionCounts
            : null;
        if (policyValue.requiredTaggedActionCounts !== undefined && taggedCounts === null) {
          errors.push(`${basePrefix}.requiredTaggedActionCounts must be an object when provided`);
        }
        if (taggedCounts) {
          const tags = Object.keys(taggedCounts);
          if (tags.length === 0) {
            errors.push(`${basePrefix}.requiredTaggedActionCounts must not be empty when provided`);
          }
          for (const tag of tags) {
            if (!isValidActionTag(tag)) {
              errors.push(
                `${basePrefix}.requiredTaggedActionCounts.${tag} must use tag format ${ACTION_TAG_PATTERN.toString()}`,
              );
            }
            const requirement = taggedCounts[tag];
            if (isNonNegativeInteger(requirement)) {
              continue;
            }
            if (
              !requirement ||
              typeof requirement !== "object" ||
              Array.isArray(requirement)
            ) {
              errors.push(
                `${basePrefix}.requiredTaggedActionCounts.${tag} must be a non-negative integer or object`,
              );
              continue;
            }
            const hasMinCount = requirement.minCount !== undefined;
            const hasMinPendingCount = requirement.minPendingCount !== undefined;
            if (hasMinCount && !isNonNegativeInteger(requirement.minCount)) {
              errors.push(
                `${basePrefix}.requiredTaggedActionCounts.${tag}.minCount must be a non-negative integer`,
              );
            }
            if (hasMinPendingCount && !isNonNegativeInteger(requirement.minPendingCount)) {
              errors.push(
                `${basePrefix}.requiredTaggedActionCounts.${tag}.minPendingCount must be a non-negative integer`,
              );
            }
            if (
              hasMinCount &&
              hasMinPendingCount &&
              Number(requirement.minCount) === 0 &&
              Number(requirement.minPendingCount) === 0
            ) {
              errors.push(
                `${basePrefix}.requiredTaggedActionCounts.${tag} must require minCount or minPendingCount greater than zero`,
              );
            }
          }
        }
      }
    }
  }

  if (payload.horizonStates && typeof payload.horizonStates === "object") {
    for (const horizonId of VALID_HORIZONS) {
      const entry = payload.horizonStates[horizonId];
      if (!entry || typeof entry !== "object") {
        errors.push(`horizonStates.${horizonId} must be an object`);
        continue;
      }
      if (!VALID_STATUSES.includes(String(entry.status))) {
        errors.push(`horizonStates.${horizonId}.status must be one of: ${VALID_STATUSES.join(", ")}`);
      }
      if (!isNonEmptyString(entry.summary)) {
        errors.push(`horizonStates.${horizonId}.summary must be non-empty string`);
      }
    }
  }

  if (payload.history && Array.isArray(payload.history)) {
    payload.history.forEach((item, index) => {
      const prefix = `history[${String(index)}]`;
      if (!item || typeof item !== "object") {
        errors.push(`${prefix} must be an object`);
        return;
      }
      if (!isNonEmptyString(item.timestamp)) {
        errors.push(`${prefix}.timestamp must be non-empty string`);
      }
      if (!VALID_HORIZONS.includes(String(item.horizon))) {
        errors.push(`${prefix}.horizon must be one of: ${VALID_HORIZONS.join(", ")}`);
      }
      if (!VALID_STATUSES.includes(String(item.status))) {
        errors.push(`${prefix}.status must be one of: ${VALID_STATUSES.join(", ")}`);
      }
      if (!isNonEmptyString(item.note)) {
        errors.push(`${prefix}.note must be non-empty string`);
      }
    });
  }

  if (payload.activeHorizon && payload.horizonStates && typeof payload.horizonStates === "object") {
    const activeEntry = payload.horizonStates[payload.activeHorizon];
    if (!activeEntry || typeof activeEntry !== "object") {
      errors.push("activeHorizon must exist in horizonStates");
    } else {
      const activeStatus = normalizeStatusId(payload.activeStatus);
      const stateStatus = normalizeStatusId(activeEntry.status);
      if (activeStatus !== stateStatus) {
        errors.push("activeStatus must match horizonStates[activeHorizon].status");
      }
    }
  }

  if (
    payload.requiredEvidence &&
    Array.isArray(payload.requiredEvidence) &&
    payload.promotionReadiness &&
    typeof payload.promotionReadiness === "object" &&
    payload.promotionReadiness.gates &&
    typeof payload.promotionReadiness.gates === "object"
  ) {
    const requiredCommands = new Set(
      payload.requiredEvidence
        .filter((item) => item && typeof item === "object" && item.required === true)
        .map((item) => String(item.command ?? "")),
    );
    for (const [gateKey, commandName] of Object.entries(REQUIRED_GATE_COMMANDS)) {
      if (payload.promotionReadiness.gates[gateKey] === true && !requiredCommands.has(commandName)) {
        errors.push(
          `promotionReadiness.gates.${gateKey} requires requiredEvidence command: ${commandName}`,
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetPath = path.resolve(options.file || path.join(process.cwd(), "docs/HORIZON_STATUS.json"));
  const raw = await readFile(targetPath, "utf8");
  const duplicateTransitionKeys = collectDuplicateTransitionKeysFromRawJson(raw);
  const payload = JSON.parse(raw);
  const validation = validateHorizonStatus(payload);
  const duplicateKeyErrors = duplicateTransitionKeys.map(
    (transitionKey) => `goalPolicies duplicate transition key: ${transitionKey}`,
  );
  const allErrors = [...validation.errors, ...duplicateKeyErrors];
  const output = {
    file: targetPath,
    valid: allErrors.length === 0,
    errorCount: allErrors.length,
    errors: allErrors,
    activeHorizon: payload?.activeHorizon ?? null,
    activeStatus: payload?.activeStatus ?? null,
    blockerCount: Array.isArray(payload?.blockers) ? payload.blockers.length : 0,
    duplicateTransitionKeys,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!output.valid) {
    process.stderr.write(`Horizon status validation failed:\n- ${allErrors.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
