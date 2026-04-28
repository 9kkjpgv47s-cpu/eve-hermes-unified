import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "initial-scope-gate-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-initial-scope.mjs", () => {
  it("passes when checklist gates and release readiness are complete", async () => {
    await withTempDir(async (dir) => {
      const checklistPath = path.join(dir, "MASTER_EXECUTION_CHECKLIST.md");
      const readinessPath = path.join(dir, "release-readiness.json");
      const reportPath = path.join(dir, "initial-scope-gate.json");

      await writeFile(
        checklistPath,
        [
          "# Master Execution Checklist",
          "",
          "## Phase 5 - Validation and Hardening",
          "- [x] `npm run validate:failure-injection` runs and captures evidence.",
          "- [x] `npm run validate:soak` runs and captures evidence.",
          "- [x] `npm run validate:regression-eve-primary` runs and captures Eve-safe regression evidence.",
          "- [x] Failure classes are classified (no unclassified failures in passing scenarios).",
          "- [x] Trace IDs are present in all sampled response outputs.",
          "",
          "## Phase 6 - Cutover Readiness and Rollback Confidence",
          "- [x] `npm run cutover:stage -- <shadow|canary|majority|full>` process verified.",
          "- [x] `npm run cutover:rollback` process verified.",
          "- [x] `npm run validate:cutover-readiness` verifies stage transitions + rollback end state.",
          "- [x] Rollback path returns runtime to Eve-primary/no-fallback safe lane.",
          "- [x] Operational checklist and emergency actions are confirmed from runbook.",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        readinessPath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            pass: true,
            checks: {
              goalPolicyFileValidationPassed: true,
              goalPolicySourceConsistencyPassed: true,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-initial-scope.mjs",
          "--checklist",
          checklistPath,
          "--release-readiness",
          readinessPath,
          "--out",
          reportPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const reportRaw = await readFile(reportPath, "utf8");
      expect(reportRaw).toContain("\"pass\": true");
      expect(reportRaw).toContain("\"releaseReadinessPass\": true");
      expect(reportRaw).toContain("\"releaseReadinessGoalPolicyValidationPass\": true");
      expect(reportRaw).toContain("\"releaseReadinessGoalPolicySourceConsistencyPass\": true");
      expect(reportRaw).toContain("\"missingChecklistItems\": []");
    });
  });

  it("fails when required checklist items are missing", async () => {
    await withTempDir(async (dir) => {
      const checklistPath = path.join(dir, "MASTER_EXECUTION_CHECKLIST.md");
      const readinessPath = path.join(dir, "release-readiness.json");
      const reportPath = path.join(dir, "initial-scope-gate.json");

      await writeFile(
        checklistPath,
        [
          "# Master Execution Checklist",
          "",
          "## Phase 5 - Validation and Hardening",
          "- [x] `npm run validate:failure-injection` runs and captures evidence.",
          "- [ ] `npm run validate:soak` runs and captures evidence.",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        readinessPath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            pass: true,
            checks: {
              goalPolicyFileValidationPassed: true,
              goalPolicySourceConsistencyPassed: true,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-initial-scope.mjs",
          "--checklist",
          checklistPath,
          "--release-readiness",
          readinessPath,
          "--out",
          reportPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const reportRaw = await readFile(reportPath, "utf8");
      expect(reportRaw).toContain("\"pass\": false");
      expect(reportRaw).toContain("validate:soak");
    });
  });

  it("fails when release readiness is missing goal-policy validation pass", async () => {
    await withTempDir(async (dir) => {
      const checklistPath = path.join(dir, "MASTER_EXECUTION_CHECKLIST.md");
      const readinessPath = path.join(dir, "release-readiness.json");
      const reportPath = path.join(dir, "initial-scope-gate.json");

      await writeFile(
        checklistPath,
        [
          "# Master Execution Checklist",
          "",
          "## Phase 5 - Validation and Hardening",
          "- [x] `npm run validate:failure-injection` runs and captures evidence.",
          "- [x] `npm run validate:soak` runs and captures evidence.",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        readinessPath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            pass: true,
            checks: {
              goalPolicyFileValidationPassed: false,
              goalPolicySourceConsistencyPassed: true,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-initial-scope.mjs",
          "--checklist",
          checklistPath,
          "--release-readiness",
          readinessPath,
          "--out",
          reportPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const reportRaw = await readFile(reportPath, "utf8");
      expect(reportRaw).toContain("\"pass\": false");
      expect(reportRaw).toContain("release_readiness_goal_policy_validation_not_passed");
    });
  });

  it("fails when release readiness is missing goal-policy source consistency pass", async () => {
    await withTempDir(async (dir) => {
      const checklistPath = path.join(dir, "MASTER_EXECUTION_CHECKLIST.md");
      const readinessPath = path.join(dir, "release-readiness.json");
      const reportPath = path.join(dir, "initial-scope-gate.json");

      await writeFile(
        checklistPath,
        [
          "# Master Execution Checklist",
          "",
          "## Phase 5 - Validation and Hardening",
          "- [x] `npm run validate:failure-injection` runs and captures evidence.",
          "- [x] `npm run validate:soak` runs and captures evidence.",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        readinessPath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            pass: true,
            checks: {
              goalPolicyFileValidationPassed: true,
              goalPolicySourceConsistencyPassed: false,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-initial-scope.mjs",
          "--checklist",
          checklistPath,
          "--release-readiness",
          readinessPath,
          "--out",
          reportPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const reportRaw = await readFile(reportPath, "utf8");
      expect(reportRaw).toContain("\"pass\": false");
      expect(reportRaw).toContain("release_readiness_goal_policy_source_consistency_not_passed");
    });
  });
});
