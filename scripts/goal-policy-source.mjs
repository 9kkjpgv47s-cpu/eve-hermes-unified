import { access, readFile } from "node:fs/promises";
import path from "node:path";

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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

function collectDuplicateTransitionKeys(rawJson) {
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
} = {}) {
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
}) {
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

  const duplicateTransitionKeys = collectDuplicateTransitionKeys(fileRaw);
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
  return {
    ...emptySourceResult({
      source: "file",
      sourceSelection,
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
    sourceSelection: result.sourceSelection,
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
    sourceSelection: result.sourceSelection,
    goalPolicyFile: result.goalPolicyFile,
    ok: result.ok,
    reason: result.reason,
    errors: result.errors,
  };
}

