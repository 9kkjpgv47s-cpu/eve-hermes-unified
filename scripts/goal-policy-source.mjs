import { access, readFile } from "node:fs/promises";
import path from "node:path";

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeComparableJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeComparableJsonValue(item));
  }
  if (isPlainObject(value)) {
    const normalized = {};
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeComparableJsonValue(value[key]);
    }
    return normalized;
  }
  return value;
}

function comparePolicyValues(left, right) {
  const normalizedLeft = normalizeComparableJsonValue(left);
  const normalizedRight = normalizeComparableJsonValue(right);
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

function resolveCrossSourcePolicyConsistencySignals({
  fileTransitions = {},
  statusTransitions = {},
  checked = false,
} = {}) {
  if (!checked) {
    return {
      checked: false,
      overlapTransitionKeys: [],
      conflictTransitionKeys: [],
      pass: true,
    };
  }
  const fileTransitionKeys = Object.keys(fileTransitions);
  const overlapTransitionKeys = fileTransitionKeys.filter((transitionKey) =>
    Object.prototype.hasOwnProperty.call(statusTransitions, transitionKey),
  );
  const conflictTransitionKeys = overlapTransitionKeys.filter(
    (transitionKey) =>
      !comparePolicyValues(fileTransitions[transitionKey], statusTransitions[transitionKey]),
  );
  return {
    checked: true,
    overlapTransitionKeys,
    conflictTransitionKeys,
    pass: conflictTransitionKeys.length === 0,
  };
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

function collectDuplicateJsonKeyPaths(rawJson) {
  if (typeof rawJson !== "string" || rawJson.trim().length === 0) {
    return [];
  }
  const duplicatePaths = new Set();
  const stack = [];
  let inString = false;
  let escapeNext = false;
  let collectingKey = false;
  let keyBuffer = "";
  let pendingKey = null;
  for (let index = 0; index < rawJson.length; index += 1) {
    const char = rawJson[index];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        if (collectingKey) {
          keyBuffer += char;
        }
        continue;
      }
      if (char === "\\") {
        escapeNext = true;
        if (collectingKey) {
          keyBuffer += char;
        }
        continue;
      }
      if (char === "\"") {
        inString = false;
        if (collectingKey) {
          pendingKey = keyBuffer;
          collectingKey = false;
          keyBuffer = "";
        }
        continue;
      }
      if (collectingKey) {
        keyBuffer += char;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
      if (stack.length > 0 && stack[stack.length - 1].type === "object") {
        const frame = stack[stack.length - 1];
        if (frame.expectingKey) {
          collectingKey = true;
          keyBuffer = "";
        }
      }
      continue;
    }
    if (char === "{") {
      const pathPrefix = stack
        .filter((frame) => frame.type === "object" && typeof frame.pathSegment === "string")
        .map((frame) => frame.pathSegment);
      const frame = {
        type: "object",
        keys: new Set(),
        expectingKey: true,
        expectingValue: false,
        pendingValueForKey: null,
        pathSegment: null,
      };
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (parent.type === "object" && typeof parent.pendingValueForKey === "string") {
          frame.pathSegment = parent.pendingValueForKey;
          parent.pendingValueForKey = null;
          parent.expectingValue = false;
          parent.expectingKey = false;
        }
      }
      frame.pathPrefix = pathPrefix;
      stack.push(frame);
      pendingKey = null;
      continue;
    }
    if (char === "}") {
      const frame = stack.pop();
      if (frame && frame.type === "object") {
        frame.expectingKey = false;
        frame.expectingValue = false;
        frame.pendingValueForKey = null;
      }
      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        if (parent.type === "object") {
          parent.expectingValue = false;
        }
      }
      pendingKey = null;
      continue;
    }
    if (char === "[") {
      stack.push({ type: "array" });
      pendingKey = null;
      continue;
    }
    if (char === "]") {
      stack.pop();
      pendingKey = null;
      continue;
    }
    if (char === ":" && pendingKey !== null) {
      const frame = stack[stack.length - 1];
      if (frame && frame.type === "object") {
        const pathSegments = [...(frame.pathPrefix ?? [])];
        if (frame.pathSegment) {
          pathSegments.push(frame.pathSegment);
        }
        const fullPath = `$.${[...pathSegments, pendingKey].join(".")}`;
        if (frame.keys.has(pendingKey)) {
          duplicatePaths.add(fullPath);
        } else {
          frame.keys.add(pendingKey);
        }
        frame.pendingValueForKey = pendingKey;
        frame.expectingKey = false;
        frame.expectingValue = true;
      }
      pendingKey = null;
      continue;
    }
    if (char === ",") {
      const frame = stack[stack.length - 1];
      if (frame && frame.type === "object") {
        frame.expectingKey = true;
        frame.expectingValue = false;
        frame.pendingValueForKey = null;
      }
      pendingKey = null;
      continue;
    }
    if (!/\s/.test(char)) {
      const frame = stack[stack.length - 1];
      if (frame && frame.type === "object" && frame.expectingValue) {
        frame.expectingValue = false;
      }
    }
  }
  return Array.from(duplicatePaths).sort();
}

export function collectDuplicateTransitionKeysFromRawJson(rawJson) {
  const duplicatePaths = collectDuplicateJsonKeyPaths(rawJson);
  if (duplicatePaths.length === 0) {
    return [];
  }
  const transitionDuplicates = [];
  for (const duplicatePath of duplicatePaths) {
    const normalizedPath = String(duplicatePath).replace(/\["([^"]+)"\]/g, ".$1");
    if (!normalizedPath.includes(".transitions.")) {
      continue;
    }
    const duplicateKey = normalizedPath.split(".").pop();
    if (isNonEmptyString(duplicateKey)) {
      transitionDuplicates.push(String(duplicateKey));
    } else if (normalizedPath.includes("->")) {
      transitionDuplicates.push(normalizedPath.slice(normalizedPath.lastIndexOf(".") + 1));
    }
  }
  return Array.from(new Set(transitionDuplicates)).sort();
}

// Backward-compatible alias used by existing validators.
export const collectDuplicateTransitionKeys = collectDuplicateTransitionKeysFromRawJson;

async function pathExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function emptySourceResult({
  source = "horizon-status",
  sourceSelection = "horizon-status",
  pathValue = null,
  goalPolicyFile = null,
  reason = "",
  crossSourceConsistencyChecked = false,
  crossSourceOverlapTransitionKeys = [],
  crossSourceConflictTransitionKeys = [],
} = {}) {
  const consistencyPass =
    crossSourceConsistencyChecked !== true || crossSourceConflictTransitionKeys.length === 0;
  return {
    ok: reason.length === 0,
    reason: reason.length > 0 ? reason : null,
    valid: reason.length === 0,
    errors: reason.length > 0 ? [reason] : [],
    fromFile: source === "file",
    source,
    sourceSelection,
    path: pathValue,
    goalPolicyFile,
    transitions: {},
    crossSourceConsistencyChecked,
    crossSourceOverlapTransitionKeys,
    crossSourceConflictTransitionKeys,
    crossSourceConsistencyPass: consistencyPass,
  };
}

export function normalizeGoalPolicyFilePath(goalPolicyFile, fallbackCwd = process.cwd()) {
  const rawValue = String(goalPolicyFile ?? "").trim();
  if (rawValue.length === 0) {
    return "";
  }
  return path.resolve(fallbackCwd, rawValue);
}

export function resolveGoalPolicyFilePath({
  goalPolicyFile = "",
  horizonStatusFile = "",
  cwd = process.cwd(),
} = {}) {
  const explicitGoalPolicyFile = normalizeGoalPolicyFilePath(goalPolicyFile, cwd);
  if (explicitGoalPolicyFile.length > 0) {
    return explicitGoalPolicyFile;
  }
  const adjacentDefaultGoalPolicyFile = resolveAdjacentDefaultGoalPolicyPath(horizonStatusFile, cwd);
  return adjacentDefaultGoalPolicyFile.length > 0 ? adjacentDefaultGoalPolicyFile : "";
}

function resolveAdjacentDefaultGoalPolicyPath(horizonStatusFile, cwd = process.cwd()) {
  const resolvedStatusPath = normalizeGoalPolicyFilePath(horizonStatusFile, cwd);
  if (resolvedStatusPath.length === 0) {
    return "";
  }
  return path.join(path.dirname(resolvedStatusPath), "GOAL_POLICIES.json");
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
  requireGoalPolicySourceConsistency = false,
  requireCrossSourceConsistency = false,
  requireSourceConsistency = false,
}) {
  const requireConsistencyCheck =
    requireGoalPolicySourceConsistency === true ||
    requireCrossSourceConsistency === true ||
    requireSourceConsistency === true;
  const explicitGoalPolicyFile = normalizeGoalPolicyFilePath(goalPolicyFile, cwd);
  const adjacentDefaultGoalPolicyFile =
    explicitGoalPolicyFile.length === 0
      ? resolveAdjacentDefaultGoalPolicyPath(horizonStatusFile, cwd)
      : "";
  const useAdjacentDefault =
    explicitGoalPolicyFile.length === 0 &&
    adjacentDefaultGoalPolicyFile.length > 0 &&
    (await pathExists(adjacentDefaultGoalPolicyFile));
  const resolvedGoalPolicyFile = explicitGoalPolicyFile.length > 0
    ? explicitGoalPolicyFile
    : useAdjacentDefault
      ? adjacentDefaultGoalPolicyFile
      : "";
  if (resolvedGoalPolicyFile.length === 0) {
    const resolvedStatusPath = horizonStatusFile
      ? normalizeGoalPolicyFilePath(horizonStatusFile, cwd)
      : "";
    if (resolvedStatusPath.length > 0 && (await pathExists(resolvedStatusPath))) {
      try {
        const statusRaw = await readFile(resolvedStatusPath, "utf8");
        const duplicateTransitionKeys = collectDuplicateTransitionKeysFromRawJson(statusRaw);
        if (duplicateTransitionKeys.length > 0) {
          return emptySourceResult({
            source: "horizon-status",
            sourceSelection: "horizon-status-fallback",
            pathValue: resolvedStatusPath,
            goalPolicyFile: null,
            reason: `horizon_status_duplicate_transition_keys:${duplicateTransitionKeys.join(",")}`,
          });
        }
      } catch (error) {
        return emptySourceResult({
          source: "horizon-status",
          sourceSelection: "horizon-status-fallback",
          pathValue: resolvedStatusPath,
          goalPolicyFile: null,
          reason: `horizon_status_unreadable_for_policy_source:${resolvedStatusPath}:${String(error?.message ?? error)}`,
        });
      }
    }
    const fallbackTransitions = normalizeTransitionsContainer(horizonStatus?.goalPolicies);
    return {
      ...emptySourceResult({
        source: "horizon-status",
        sourceSelection: "horizon-status-fallback",
        pathValue: horizonStatusFile ? path.resolve(cwd, horizonStatusFile) : null,
        goalPolicyFile: null,
      }),
      transitions: fallbackTransitions,
    };
  }
  const sourceSelection = explicitGoalPolicyFile.length > 0 ? "explicit" : "adjacent-default";

  if (!(await pathExists(resolvedGoalPolicyFile))) {
    return emptySourceResult({
      source: "file",
      sourceSelection,
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      reason: `goal_policy_file_not_found:${resolvedGoalPolicyFile}`,
    });
  }

  let filePayload;
  let fileRaw = "";
  try {
    fileRaw = await readFile(resolvedGoalPolicyFile, "utf8");
    filePayload = JSON.parse(fileRaw);
  } catch (error) {
    return emptySourceResult({
      source: "file",
      sourceSelection,
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      reason: `goal_policy_file_invalid_json:${resolvedGoalPolicyFile}:${String(error?.message ?? error)}`,
    });
  }

  const duplicateTransitionKeys = collectDuplicateTransitionKeysFromRawJson(fileRaw);
  if (duplicateTransitionKeys.length > 0) {
    return emptySourceResult({
      source: "file",
      sourceSelection,
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      reason: `goal_policy_file_duplicate_transition_keys:${duplicateTransitionKeys.join(",")}`,
    });
  }

  const extractedGoalPolicies = extractGoalPolicies(filePayload);
  if (!isPlainObject(extractedGoalPolicies)) {
    return emptySourceResult({
      source: "file",
      sourceSelection,
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      reason: `goal_policy_file_invalid_structure:${resolvedGoalPolicyFile}`,
    });
  }

  const transitions = normalizeTransitionsContainer(extractedGoalPolicies);
  let crossSourceConsistency = resolveCrossSourcePolicyConsistencySignals({
    checked: false,
  });
  if (requireConsistencyCheck) {
    let statusPayload = isPlainObject(horizonStatus) ? horizonStatus : null;
    const resolvedStatusPath = normalizeGoalPolicyFilePath(horizonStatusFile, cwd);
    if (!statusPayload) {
      if (!isNonEmptyString(resolvedStatusPath)) {
        return emptySourceResult({
          source: "file",
          sourceSelection,
          pathValue: resolvedGoalPolicyFile,
          goalPolicyFile: resolvedGoalPolicyFile,
          reason: "goal_policy_source_consistency_missing_horizon_status_file",
        });
      }
      if (!(await pathExists(resolvedStatusPath))) {
        return emptySourceResult({
          source: "file",
          sourceSelection,
          pathValue: resolvedGoalPolicyFile,
          goalPolicyFile: resolvedGoalPolicyFile,
          reason: `goal_policy_source_consistency_horizon_status_not_found:${resolvedStatusPath}`,
        });
      }
      try {
        statusPayload = JSON.parse(await readFile(resolvedStatusPath, "utf8"));
      } catch (error) {
        return emptySourceResult({
          source: "file",
          sourceSelection,
          pathValue: resolvedGoalPolicyFile,
          goalPolicyFile: resolvedGoalPolicyFile,
          reason: `goal_policy_source_consistency_horizon_status_invalid_json:${resolvedStatusPath}:${String(error?.message ?? error)}`,
        });
      }
    }
    const statusTransitions = normalizeTransitionsContainer(statusPayload?.goalPolicies);
    crossSourceConsistency = resolveCrossSourcePolicyConsistencySignals({
      fileTransitions: transitions,
      statusTransitions,
      checked: true,
    });
    if (!crossSourceConsistency.pass) {
      return emptySourceResult({
        source: "file",
        sourceSelection,
        pathValue: resolvedGoalPolicyFile,
        goalPolicyFile: resolvedGoalPolicyFile,
        reason: `goal_policy_source_transition_conflicts:${crossSourceConsistency.conflictTransitionKeys.join(",")}`,
        crossSourceConsistencyChecked: crossSourceConsistency.checked,
        crossSourceOverlapTransitionKeys: crossSourceConsistency.overlapTransitionKeys,
        crossSourceConflictTransitionKeys: crossSourceConsistency.conflictTransitionKeys,
      });
    }
  }
  return {
    ...emptySourceResult({
      source: "file",
      sourceSelection,
      pathValue: resolvedGoalPolicyFile,
      goalPolicyFile: resolvedGoalPolicyFile,
      crossSourceConsistencyChecked: crossSourceConsistency.checked,
      crossSourceOverlapTransitionKeys: crossSourceConsistency.overlapTransitionKeys,
      crossSourceConflictTransitionKeys: crossSourceConsistency.conflictTransitionKeys,
    }),
    transitions,
  };
}

export async function resolveGoalPolicySource(options = {}) {
  const result = await loadGoalPolicyTransitions(options);
  return {
    transitions: result.transitions,
    source: result.source,
    sourceSelection: result.sourceSelection,
    goalPolicyFile: result.goalPolicyFile,
    crossSourceConsistencyChecked: result.crossSourceConsistencyChecked,
    crossSourceOverlapTransitionKeys: result.crossSourceOverlapTransitionKeys,
    crossSourceConflictTransitionKeys: result.crossSourceConflictTransitionKeys,
    crossSourceConsistencyPass: result.crossSourceConsistencyPass,
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
    sourceSelection: result.sourceSelection,
    goalPolicyFile: result.goalPolicyFile,
    crossSourceConsistencyChecked: result.crossSourceConsistencyChecked,
    crossSourceOverlapTransitionKeys: result.crossSourceOverlapTransitionKeys,
    crossSourceConflictTransitionKeys: result.crossSourceConflictTransitionKeys,
    crossSourceConsistencyPass: result.crossSourceConsistencyPass,
    ok: result.ok,
    reason: result.reason,
    errors: result.errors,
  };
}

