#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";

const VALID_HORIZONS = ["H1", "H2", "H3", "H4", "H5"];
const VALID_STATUSES = ["planned", "in_progress", "blocked", "completed"];
const VALID_SEVERITIES = ["low", "medium", "high", "critical"];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStatusId(value) {
  return String(value ?? "").trim().toUpperCase();
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

function validateHorizonStatus(payload) {
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
    });
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
    });
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

  return { valid: errors.length === 0, errors };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetPath = path.resolve(options.file || path.join(process.cwd(), "docs/HORIZON_STATUS.json"));
  const raw = await readFile(targetPath, "utf8");
  const payload = JSON.parse(raw);
  const validation = validateHorizonStatus(payload);
  const output = {
    file: targetPath,
    valid: validation.valid,
    errorCount: validation.errors.length,
    errors: validation.errors,
    activeHorizon: payload?.activeHorizon ?? null,
    activeStatus: payload?.activeStatus ?? null,
    blockerCount: Array.isArray(payload?.blockers) ? payload.blockers.length : 0,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!validation.valid) {
    process.stderr.write(`Horizon status validation failed:\n- ${validation.errors.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
