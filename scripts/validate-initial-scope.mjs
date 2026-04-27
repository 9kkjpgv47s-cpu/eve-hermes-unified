#!/usr/bin/env node
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const options = {
    checklistPath: "",
    releaseReadinessPath: "",
    evidenceDir: "",
    out: "",
    requireReleaseReadinessGoalPolicyValidation: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    if (arg === "--checklist") {
      options.checklistPath = value ?? "";
      i += 1;
    } else if (arg === "--release-readiness") {
      options.releaseReadinessPath = value ?? "";
      i += 1;
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      i += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      i += 1;
    } else if (
      arg === "--allow-release-readiness-without-goal-policy-validation" ||
      arg === "--allow-release-readiness-without-goal-policy-file-validation"
    ) {
      options.requireReleaseReadinessGoalPolicyValidation = false;
    } else if (
      arg === "--require-release-readiness-goal-policy-validation" ||
      arg === "--require-release-readiness-goal-policy-file-validation"
    ) {
      options.requireReleaseReadinessGoalPolicyValidation = true;
    }
  }
  return options;
}

function applyBooleanEnvOverride(options) {
  const rawValue = String(
    process.env.UNIFIED_INITIAL_SCOPE_REQUIRE_GOAL_POLICY_FILE_VALIDATION ?? "",
  )
    .trim()
    .toLowerCase();
  if (rawValue === "1" || rawValue === "true" || rawValue === "yes" || rawValue === "on") {
    options.requireReleaseReadinessGoalPolicyValidation = true;
  } else if (
    rawValue === "0" ||
    rawValue === "false" ||
    rawValue === "no" ||
    rawValue === "off"
  ) {
    options.requireReleaseReadinessGoalPolicyValidation = false;
  }
}

async function newestFileInDir(dir, prefix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
    .map((entry) => path.join(dir, entry.name));
  if (matches.length === 0) {
    return null;
  }
  matches.sort();
  return matches[matches.length - 1];
}

function findUncheckedChecklistItems(checklistRaw) {
  const lines = checklistRaw.split(/\r?\n/);
  const unchecked = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes("- [ ]")) {
      unchecked.push({
        line: i + 1,
        content: line.trim(),
      });
    }
  }
  return unchecked;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  applyBooleanEnvOverride(options);
  const checklistPath =
    options.checklistPath.trim() ||
    path.resolve(process.cwd(), "docs/MASTER_EXECUTION_CHECKLIST.md");
  const evidenceDir =
    options.evidenceDir.trim() ||
    path.resolve(process.cwd(), "evidence");
  const releaseReadinessPath =
    options.releaseReadinessPath.trim() ||
    (await newestFileInDir(evidenceDir, "release-readiness-")) ||
    "";
  const outPath =
    options.out.trim() ||
    path.join(evidenceDir, `initial-scope-validation-${Date.now().toString(36)}.json`);

  const failures = [];

  const checklistRaw = await readFile(checklistPath, "utf8");
  const uncheckedItems = findUncheckedChecklistItems(checklistRaw);
  if (uncheckedItems.length > 0) {
    failures.push(`unchecked_checklist_items:${uncheckedItems.length}`);
  }

  let releaseReadiness = null;
  let releaseReadinessGoalPolicyValidationPassed = false;
  let releaseReadinessGoalPolicyValidationReported = false;
  if (!releaseReadinessPath) {
    failures.push("missing_release_readiness_report");
  } else {
    const raw = await readFile(releaseReadinessPath, "utf8");
    releaseReadiness = JSON.parse(raw);
    const goalPolicyFileValidationResult = releaseReadiness?.checks?.goalPolicyFileValidationPassed;
    const legacyGoalPolicyValidationResult = releaseReadiness?.checks?.goalPolicyValidationPass;
    releaseReadinessGoalPolicyValidationReported =
      typeof goalPolicyFileValidationResult === "boolean" ||
      typeof legacyGoalPolicyValidationResult === "boolean";
    releaseReadinessGoalPolicyValidationPassed =
      goalPolicyFileValidationResult === true || legacyGoalPolicyValidationResult === true;
    if (!releaseReadiness?.pass) {
      failures.push("release_readiness_not_passed");
    }
    if (
      options.requireReleaseReadinessGoalPolicyValidation &&
      !releaseReadinessGoalPolicyValidationPassed
    ) {
      failures.push(
        releaseReadinessGoalPolicyValidationReported
          ? "release_readiness_goal_policy_validation_not_passed"
          : "release_readiness_goal_policy_validation_missing",
      );
    }
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    checklistPath,
    releaseReadinessPath: releaseReadinessPath || null,
    missingChecklistItems: uncheckedItems,
    releaseReadinessPass: Boolean(releaseReadiness?.pass),
    releaseReadinessGoalPolicyValidationPass: releaseReadinessGoalPolicyValidationPassed,
    checks: {
      uncheckedChecklistItems: uncheckedItems,
      releaseReadinessPassed: Boolean(releaseReadiness?.pass),
      requireReleaseReadinessGoalPolicyValidation:
        options.requireReleaseReadinessGoalPolicyValidation,
      releaseReadinessGoalPolicyValidationReported:
        releaseReadinessGoalPolicyValidationReported,
      releaseReadinessGoalPolicyValidationPassed:
        releaseReadinessGoalPolicyValidationPassed,
      releaseReadinessFailures: Array.isArray(releaseReadiness?.failures)
        ? releaseReadiness.failures
        : [],
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);

  if (!payload.pass) {
    process.stderr.write(`Initial scope validation failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
