import { access, readFile } from "node:fs/promises";
import path from "node:path";

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeTransitionsContainer(goalPolicies) {
  if (!isPlainObject(goalPolicies)) {
    return {};
  }
  if (isPlainObject(goalPolicies.transitions)) {
    return goalPolicies.transitions;
  }
  return goalPolicies;
}

function extractGoalPolicies(payload) {
  if (isPlainObject(payload?.goalPolicies)) {
    return payload.goalPolicies;
  }
  if (isPlainObject(payload)) {
    return payload;
  }
  return {};
}

function emptySourceResult({
  source = "horizon-status",
  pathValue = null,
  goalPolicyFile = null,
  reason = "",
} = {}) {
  return {
    ok: reason.length === 0,
    reason: reason.length > 0 ? reason : null,
    valid: reason.length === 0,
    errors: reason.length > 0 ? [reason] : [],
    fromFile: source === "file",
    source,
    path: pathValue,
    goalPolicyFile,
    transitions: {},
  };
}

export function normalizeGoalPolicyFilePath(goalPolicyFile, fallbackCwd = process.cwd()) {
  const rawValue = String(goalPolicyFile ?? "").trim();
  if (rawValue.length === 0) {
    return "";
  }
  return path.resolve(fallbackCwd, rawValue);
}

export function validateGoalPolicySourceOption(goalPolicyFile) {
  if (goalPolicyFile === undefined || goalPolicyFile === null) {
    return { valid: true, errors: [] };
  }
  if (typeof goalPolicyFile !== "string") {
    return { valid: false, errors: [`invalid_goal_policy_file_type:${typeof goalPolicyFile}`] };
  }
  if (goalPolicyFile.trim().length === 0) {
    return { valid: true, errors: [] };
  }
  return { valid: true, errors: [] };
}

export async function loadGoalPolicyTransitions({
  goalPolicyFile = "",
  horizonStatus = null,
  horizonStatusFile = "",
  cwd = process.cwd(),
}) {
  const resolvedGoalPolicyFile = normalizeGoalPolicyFilePath(goalPolicyFile, cwd);
  if (resolvedGoalPolicyFile.length === 0) {
    const fallbackTransitions = normalizeTransitionsContainer(horizonStatus?.goalPolicies);
    return {
      ...emptySourceResult({
        source: "horizon-status",
        pathValue: horizonStatusFile ? path.resolve(cwd, horizonStatusFile) : null,
        goalPolicyFile: null,
      }),
      transitions: fallbackTransitions,
    };
  }

  try {
    await access(resolvedGoalPolicyFile);
  } catch {
    return emptySourceResult({
      source: "file",
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      reason: `goal_policy_file_not_found:${resolvedGoalPolicyFile}`,
    });
  }

  let filePayload;
  try {
    filePayload = JSON.parse(await readFile(resolvedGoalPolicyFile, "utf8"));
  } catch (error) {
    return emptySourceResult({
      source: "file",
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      reason: `goal_policy_file_invalid_json:${resolvedGoalPolicyFile}:${String(error?.message ?? error)}`,
    });
  }

  const extractedGoalPolicies = extractGoalPolicies(filePayload);
  if (!isPlainObject(extractedGoalPolicies)) {
    return emptySourceResult({
      source: "file",
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      reason: `goal_policy_file_invalid_structure:${resolvedGoalPolicyFile}`,
    });
  }

  const transitions = normalizeTransitionsContainer(extractedGoalPolicies);
  return {
    ...emptySourceResult({
      source: "file",
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
    }),
    transitions,
  };
}

export async function resolveGoalPolicySource(options = {}) {
  const result = await loadGoalPolicyTransitions(options);
  return {
    transitions: result.transitions,
    source: result.source,
    goalPolicyFile: result.goalPolicyFile,
    ok: result.ok,
    reason: result.reason,
    errors: result.errors,
  };
}

export async function loadGoalPolicies(options = {}) {
  const result = await loadGoalPolicyTransitions(options);
  return {
    policies: result.transitions,
    source: result.source,
    goalPolicyFile: result.goalPolicyFile,
    ok: result.ok,
    reason: result.reason,
    errors: result.errors,
  };
}

