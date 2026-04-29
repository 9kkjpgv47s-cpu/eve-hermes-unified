import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "goal-policy-coverage-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedHorizonStatus(
  statusPath: string,
  options?: {
    withH3H4?: boolean;
    withH4H5?: boolean;
    includeTaggedCounts?: boolean;
  },
): Promise<void> {
  const withH3H4 = options?.withH3H4 ?? true;
  const withH4H5 = options?.withH4H5 ?? true;
  const includeTaggedCounts = options?.includeTaggedCounts ?? true;

  const transitions: Record<string, unknown> = {
    "H2->H3": {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.1,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: includeTaggedCounts
        ? {
            durability: { minCount: 2, minPendingCount: 1 },
          }
        : undefined,
    },
  };
  if (withH3H4) {
    transitions["H3->H4"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: includeTaggedCounts
        ? {
            policy: 1,
          }
        : undefined,
    };
  }
  if (withH4H5) {
    transitions["H4->H5"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: includeTaggedCounts
        ? {
            automation: { minCount: 1, minPendingCount: 1 },
          }
        : undefined,
    };
  }

  await writeFile(
    statusPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "goal policy coverage fixture",
        blockers: [],
        requiredEvidence: [
          {
            id: "h1-release-readiness",
            command: "npm run validate:release-readiness",
            artifactPattern: "evidence/release-readiness-*.json",
            required: true,
          },
          {
            id: "h1-merge-bundle",
            command: "npm run validate:merge-bundle",
            artifactPattern: "evidence/merge-bundle-validation-*.json",
            required: true,
          },
          {
            id: "h1-bundle-verification",
            command: "npm run verify:merge-bundle",
            artifactPattern: "evidence/bundle-verification-*.json",
            required: true,
          },
          {
            id: "h1-cutover-readiness",
            command: "npm run validate:cutover-readiness",
            artifactPattern: "evidence/cutover-readiness-*.json",
            required: true,
          },
          {
            id: "h1-evidence-summary",
            command: "npm run validate:evidence-summary",
            artifactPattern: "evidence/validation-summary-*.json",
            required: true,
          },
        ],
        nextActions: [
          { id: "h2-action-1", summary: "seed", targetHorizon: "H2", status: "completed", tags: ["durability"] },
          { id: "h3-action-1", summary: "seed", targetHorizon: "H3", status: "planned", tags: ["durability"] },
          { id: "h4-action-1", summary: "seed", targetHorizon: "H4", status: "planned", tags: ["policy"] },
          { id: "h5-action-1", summary: "seed", targetHorizon: "H5", status: "planned", tags: ["automation"] },
        ],
        goalPolicies: { transitions },
        promotionReadiness: {
          targetStage: "majority",
          gates: {
            releaseReadinessPass: true,
            mergeBundlePass: true,
            bundleVerificationPass: true,
            cutoverReadinessPass: true,
            evidenceSummaryPass: true,
          },
        },
        horizonStates: {
          H1: { status: "completed", summary: "H1 complete" },
          H2: { status: "in_progress", summary: "H2 active" },
          H3: { status: "planned", summary: "H3 planned" },
          H4: { status: "planned", summary: "H4 planned" },
          H5: { status: "planned", summary: "H5 planned" },
          H6: { status: "planned", summary: "H6 planned" },
          H7: { status: "planned", summary: "H7 planned" },
          H8: { status: "planned", summary: "H8 planned" },
          H9: { status: "planned", summary: "H9 planned" },
          H10: { status: "planned", summary: "H10 planned" },
          H11: { status: "planned", summary: "H11 planned" },
          H12: { status: "planned", summary: "H12 planned" },

          H13: { status: "planned", summary: "H13 planned" },

          H14: { status: "planned", summary: "H14 planned" },
        },
        history: [
          {
            timestamp: new Date().toISOString(),
            horizon: "H2",
            status: "in_progress",
            note: "seed",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function seedGoalPolicyFile(
  policyPath: string,
  options?: { includeH3H4?: boolean; includeH4H5?: boolean; includeTaggedCounts?: boolean },
): Promise<void> {
  const includeH3H4 = options?.includeH3H4 ?? true;
  const includeH4H5 = options?.includeH4H5 ?? true;
  const includeTaggedCounts = options?.includeTaggedCounts ?? true;
  const transitions: Record<string, unknown> = {
    "H2->H3": {
      minimumGoalIncrease: 2,
      minActionGrowthFactor: 1.2,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: includeTaggedCounts ? { durability: 1 } : {},
    },
  };
  if (includeH3H4) {
    transitions["H3->H4"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: includeTaggedCounts ? { policy: 1 } : {},
    };
  }
  if (includeH4H5) {
    transitions["H4->H5"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: includeTaggedCounts ? { automation: 1 } : {},
    };
  }
  await writeFile(policyPath, JSON.stringify({ transitions }, null, 2), "utf8");
}

async function seedHorizonStatusWithExternalPolicyBaseline(statusPath: string): Promise<void> {
  await seedHorizonStatus(statusPath, { withH3H4: false, withH4H5: false, includeTaggedCounts: false });
  const payload = JSON.parse(await readFile(statusPath, "utf8")) as {
    goalPolicies?: { transitions?: Record<string, unknown> };
  };
  payload.goalPolicies = payload.goalPolicies ?? {};
  payload.goalPolicies.transitions = {};
  await writeFile(statusPath, JSON.stringify(payload, null, 2), "utf8");
}

async function seedConflictingGoalPolicyFile(policyPath: string): Promise<void> {
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        transitions: {
          "H2->H3": {
            minimumGoalIncrease: 9,
            minActionGrowthFactor: 9,
            minPendingNextActions: 9,
            requiredTaggedActionCounts: {
              conflicting: {
                minCount: 9,
                minPendingCount: 9,
              },
            },
          },
          "H3->H4": {
            minimumGoalIncrease: 1,
            minActionGrowthFactor: 1.05,
            minPendingNextActions: 1,
            requiredTaggedActionCounts: {
              policy: 1,
            },
          },
          "H4->H5": {
            minimumGoalIncrease: 1,
            minActionGrowthFactor: 1.05,
            minPendingNextActions: 1,
            requiredTaggedActionCounts: {
              automation: 1,
            },
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function seedGoalPolicyFileWithDuplicateTransition(policyPath: string): Promise<void> {
  const payload = `{
  "schemaVersion": "v1",
  "transitions": {
    "H2->H3": {
      "minimumGoalIncrease": 1,
      "minActionGrowthFactor": 1.1,
      "minPendingNextActions": 1,
      "requiredTaggedActionCounts": {
        "durability": 1
      }
    },
    "H2->H3": {
      "minimumGoalIncrease": 2,
      "minActionGrowthFactor": 1.2,
      "minPendingNextActions": 2,
      "requiredTaggedActionCounts": {
        "durability": 2
      }
    }
  }
}
`;
  await writeFile(policyPath, payload, "utf8");
}

async function seedAutoGoalPolicyFile(
  statusPath: string,
  options?: { includeH3H4?: boolean; includeH4H5?: boolean; includeTaggedCounts?: boolean },
): Promise<string> {
  const autoPath = path.join(path.dirname(statusPath), "GOAL_POLICIES.json");
  await seedGoalPolicyFile(autoPath, options);
  return autoPath;
}

describe("check-goal-policy-coverage.mjs", () => {
  it("passes when required transitions are covered with tagged policy requirements", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "goal-policy-coverage.json");
      await seedHorizonStatus(statusPath, { withH3H4: true, withH4H5: true, includeTaggedCounts: true });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-goal-policy-coverage.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--max-target-horizon",
          "H5",
          "--require-tagged-requirements",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          transitionCount: number;
          transitionKeys: string[];
          transitions: Record<string, { hasTaggedRequirements: boolean }>;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.transitionCount).toBe(3);
      expect(payload.checks.transitionKeys).toEqual(["H2->H3", "H3->H4", "H4->H5"]);
      expect(payload.checks.transitions["H2->H3"].hasTaggedRequirements).toBe(true);
    });
  });

  it("fails when a required transition policy is missing", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "goal-policy-coverage.json");
      await seedHorizonStatus(statusPath, { withH3H4: false, withH4H5: true, includeTaggedCounts: true });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-goal-policy-coverage.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--max-target-horizon",
          "H5",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("missing_transition_policy:H3->H4");
    });
  });

  it("fails when tagged requirements are required but absent", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "goal-policy-coverage.json");
      await seedHorizonStatus(statusPath, { withH3H4: true, withH4H5: true, includeTaggedCounts: false });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-goal-policy-coverage.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--max-target-horizon",
          "H5",
          "--require-positive-pending-min",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(
        payload.failures.some((failure) =>
          failure.startsWith("invalid_required_tagged_action_counts:"),
        ),
      ).toBe(true);
    });
  });

  it("uses explicit goal policy file when provided", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const policyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-coverage.json");
      await seedHorizonStatusWithExternalPolicyBaseline(statusPath);
      await seedGoalPolicyFile(policyPath, {
        includeH3H4: true,
        includeH4H5: true,
        includeTaggedCounts: true,
      });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-goal-policy-coverage.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          policyPath,
          "--source-horizon",
          "H2",
          "--max-target-horizon",
          "H5",
          "--require-tagged-requirements",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { goalPolicyFile: string };
        checks: { transitionCount: number; coverageRate: number };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.goalPolicyFile).toBe(policyPath);
      expect(payload.checks.transitionCount).toBe(3);
      expect(payload.checks.coverageRate).toBe(1);
    });
  });

  it("auto-loads co-located GOAL_POLICIES.json when explicit file is not provided", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "goal-policy-coverage.json");
      const autoPolicyPath = await seedAutoGoalPolicyFile(statusPath, {
        includeH3H4: true,
        includeH4H5: true,
        includeTaggedCounts: true,
      });
      await seedHorizonStatusWithExternalPolicyBaseline(statusPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-goal-policy-coverage.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--max-target-horizon",
          "H5",
          "--require-tagged-requirements",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { goalPolicyFile: string | null; goalPolicySource: string | null };
        checks: { transitionCount: number; coverageRate: number };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.goalPolicySource).toBe("file");
      expect(payload.files.goalPolicyFile).toBe(path.resolve(autoPolicyPath));
      expect(payload.checks.transitionCount).toBe(3);
      expect(payload.checks.coverageRate).toBe(1);
    });
  });

  it("fails when explicit goal policy file has duplicate transition keys", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const policyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-coverage.json");
      await seedHorizonStatus(statusPath, { withH3H4: true, withH4H5: true, includeTaggedCounts: true });
      await seedGoalPolicyFileWithDuplicateTransition(policyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-goal-policy-coverage.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          policyPath,
          "--source-horizon",
          "H2",
          "--max-target-horizon",
          "H5",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(
        payload.failures.some((failure) =>
          failure.startsWith("goal_policy_source_invalid:goal_policy_file_duplicate_transition_keys:"),
        ),
      ).toBe(true);
    });
  });

  it("fails when explicit goal policy conflicts with horizon-status transitions", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const policyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-coverage-conflict.json");
      await seedHorizonStatus(statusPath, { withH3H4: true, withH4H5: true, includeTaggedCounts: true });
      await seedConflictingGoalPolicyFile(policyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-goal-policy-coverage.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          policyPath,
          "--source-horizon",
          "H2",
          "--max-target-horizon",
          "H5",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(
        payload.failures.some((failure) =>
          failure.startsWith("goal_policy_source_invalid:goal_policy_source_transition_conflicts:H2->H3"),
        ),
      ).toBe(true);
    });
  });
});
