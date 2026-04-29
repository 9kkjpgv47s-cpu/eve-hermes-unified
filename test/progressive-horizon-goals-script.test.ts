import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "progressive-goals-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedHorizonStatus(
  statusPath: string,
  options?: {
    h2GoalCount?: number;
    h3GoalCount?: number;
    activeHorizon?: string;
    h3PendingCount?: number;
    h3CapabilityCount?: number;
    /** H2 rows marked `planned` from the start of the H2 block (remainder `completed`). Default 0 = all H2 completed. */
    h2PendingCount?: number;
  },
): Promise<void> {
  const h2GoalCount = options?.h2GoalCount ?? 2;
  const h3GoalCount = options?.h3GoalCount ?? 4;
  const activeHorizon = options?.activeHorizon ?? "H2";
  const h2PendingCount = Math.min(options?.h2PendingCount ?? 0, h2GoalCount);
  const nextActions: Array<{
    id: string;
    summary: string;
    targetHorizon: string;
    status: string;
    tags?: string[];
  }> = [];
  for (let index = 0; index < h2GoalCount; index += 1) {
    nextActions.push({
      id: `h2-action-${String(index + 1)}`,
      summary: "h2 goal",
      targetHorizon: "H2",
      status: index < h2PendingCount ? "planned" : "completed",
    });
  }
  const h3PendingCount = options?.h3PendingCount ?? h3GoalCount;
  const h3CapabilityCount = Math.min(
    options?.h3CapabilityCount ?? h3GoalCount,
    h3GoalCount,
  );
  for (let index = 0; index < h3GoalCount; index += 1) {
    nextActions.push({
      id: `h3-action-${String(index + 1)}`,
      summary: "h3 goal",
      targetHorizon: "H3",
      status: index < h3PendingCount ? "planned" : "completed",
      tags: index < h3CapabilityCount ? ["capability"] : ["operations"],
    });
  }
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon,
        activeStatus: "in_progress",
        summary: "progressive goals fixture",
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
          {
            id: "h2-drill-suite",
            command: "npm run run:h2-drill-suite",
            artifactPattern: "evidence/h2-drill-suite-*.json",
            required: true,
            horizon: "H2",
          },
        ],
        nextActions,
        goalPolicies: {
          transitions: {
            "H2->H3": {
              minimumGoalIncrease: 1,
              minActionGrowthFactor: 1.2,
              minPendingNextActions: 1,
              requiredTaggedActionCounts: {
                capability: {
                  minCount: 2,
                  minPendingCount: 1,
                },
              },
            },
          },
        },
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
          H2: { status: activeHorizon === "H2" ? "in_progress" : "completed", summary: "H2 state" },
          H3: { status: activeHorizon === "H3" ? "in_progress" : "planned", summary: "H3 state" },
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
          H15: { status: "planned", summary: "H15 planned" },
          H16: { status: "planned", summary: "H16 planned" },
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
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
  options?: { includeTransition?: boolean; minimumGoalIncrease?: number },
): Promise<void> {
  const includeTransition = options?.includeTransition ?? true;
  const minimumGoalIncrease = options?.minimumGoalIncrease ?? 1;
  const transitions: Record<string, unknown> = {};
  if (includeTransition) {
    transitions["H2->H3"] = {
      minimumGoalIncrease,
      minActionGrowthFactor: 1.1,
      minPendingNextActions: 1,
      requiredTaggedActionCounts: {
        capability: {
          minCount: 2,
          minPendingCount: 1,
        },
      },
    };
  }
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        owner: "cloud-agent",
        transitions,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function seedGoalPolicyFileWithDuplicateTransitionKey(policyPath: string): Promise<void> {
  const duplicateJson = `{
  "schemaVersion": "v1",
  "transitions": {
    "H2->H3": {
      "minimumGoalIncrease": 1,
      "minActionGrowthFactor": 1.1,
      "minPendingNextActions": 1,
      "requiredTaggedActionCounts": {
        "capability": {
          "minCount": 1,
          "minPendingCount": 1
        }
      }
    },
    "H2->H3": {
      "minimumGoalIncrease": 3,
      "minActionGrowthFactor": 2,
      "minPendingNextActions": 2,
      "requiredTaggedActionCounts": {
        "capability": {
          "minCount": 2,
          "minPendingCount": 1
        }
      }
    }
  }
}
`;
  await writeFile(policyPath, duplicateJson, "utf8");
}

async function removeGoalPoliciesFromStatus(statusPath: string): Promise<void> {
  const payload = JSON.parse(await readFile(statusPath, "utf8")) as {
    goalPolicies?: unknown;
  };
  delete payload.goalPolicies;
  await writeFile(statusPath, JSON.stringify(payload, null, 2), "utf8");
}

async function seedConflictingGoalPolicyFile(policyPath: string): Promise<void> {
  await writeFile(
    policyPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        owner: "cloud-agent",
        transitions: {
          "H2->H3": {
            minimumGoalIncrease: 4,
            minActionGrowthFactor: 1.8,
            minPendingNextActions: 3,
            requiredTaggedActionCounts: {
              capability: {
                minCount: 4,
                minPendingCount: 2,
              },
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

describe("check-progressive-horizon-goals.mjs", () => {
  it("passes when next horizon has larger goal runway", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "progressive-goals.json");
      await seedHorizonStatus(statusPath, { h2GoalCount: 2, h3GoalCount: 5, activeHorizon: "H2" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-progressive-horizon-goals.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--minimum-goal-increase",
          "0",
          "--policy-key",
          "H2->H3",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          goalDelta: number;
          minActionGrowthFactor: number;
          policyKey: string | null;
          sourceBaselineCount: number;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.sourceBaselineCount).toBe(0);
      expect(payload.checks.goalDelta).toBe(3);
      expect(payload.checks.minActionGrowthFactor).toBe(1.2);
      expect(payload.checks.policyKey).toBe("H2->H3");
    });
  });

  it("fails when next horizon does not increase goal runway enough", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "progressive-goals.json");
      await seedHorizonStatus(statusPath, {
        h2GoalCount: 3,
        h3GoalCount: 3,
        h2PendingCount: 3,
        activeHorizon: "H2",
      });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-progressive-horizon-goals.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--minimum-goal-increase",
          "1",
          "--policy-key",
          "H2->H3",
          "--minimum-goal-increase",
          "0",
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
          failure.startsWith("next_action_count_below_growth_target:"),
        ),
      ).toBe(true);
    });
  });

  it("fails when policy-required action tag counts are missing", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "progressive-goals.json");
      await seedHorizonStatus(statusPath, {
        h2GoalCount: 2,
        h3GoalCount: 5,
        h3CapabilityCount: 1,
        activeHorizon: "H2",
      });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-progressive-horizon-goals.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--policy-key",
          "H2->H3",
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
        payload.failures.some((failure) => failure.startsWith("required_tag_count_below_min:")),
      ).toBe(true);
      expect(
        payload.failures.some((failure) =>
          failure.startsWith("required_tag_count_below_min:"),
        ),
      ).toBe(true);
    });
  });

  it("fails when next horizon pending runway is below threshold", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "progressive-goals.json");
      await seedHorizonStatus(statusPath, {
        h2GoalCount: 2,
        h3GoalCount: 4,
        h3PendingCount: 1,
        activeHorizon: "H2",
      });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-progressive-horizon-goals.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--minimum-goal-increase",
          "1",
          "--min-pending-next-actions",
          "2",
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
          failure.startsWith("next_pending_action_count_below_min:"),
        ),
      ).toBe(true);
    });
  });

  it("uses external goal policy file when provided", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const policyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "progressive-goals.json");
      await seedHorizonStatus(statusPath, {
        h2GoalCount: 2,
        h3GoalCount: 3,
        h2PendingCount: 2,
        activeHorizon: "H2",
      });
      await seedGoalPolicyFile(policyPath, { includeTransition: true, minimumGoalIncrease: 3 });
      await removeGoalPoliciesFromStatus(statusPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-progressive-horizon-goals.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          policyPath,
          "--source-horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--policy-key",
          "H2->H3",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { goalPolicyFile: string };
        checks: { policyKey: string | null; minimumGoalIncrease: number };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.files.goalPolicyFile).toBe(path.resolve(policyPath));
      expect(payload.checks.policyKey).toBe("H2->H3");
      expect(payload.checks.minimumGoalIncrease).toBe(3);
      expect(
        payload.failures.some((failure) => failure.startsWith("insufficient_goal_increase:")),
      ).toBe(true);
    });
  });

  it("fails when external goal policy file has duplicate transition keys", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const policyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "progressive-goals.json");
      await seedHorizonStatus(statusPath, { h2GoalCount: 2, h3GoalCount: 5, activeHorizon: "H2" });
      await seedGoalPolicyFileWithDuplicateTransitionKey(policyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-progressive-horizon-goals.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          policyPath,
          "--source-horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--policy-key",
          "H2->H3",
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
          failure.startsWith(
            "goal_policy_source_invalid:goal_policy_file_duplicate_transition_keys:H2->H3",
          ),
        ),
      ).toBe(true);
    });
  });

  it("fails when external goal policy file conflicts with horizon fallback transition policy", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const policyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "progressive-goals.json");
      await seedHorizonStatus(statusPath, { h2GoalCount: 2, h3GoalCount: 6, activeHorizon: "H2" });
      await seedConflictingGoalPolicyFile(policyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/check-progressive-horizon-goals.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          policyPath,
          "--source-horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--policy-key",
          "H2->H3",
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
          failure.startsWith(
            "goal_policy_source_invalid:goal_policy_source_transition_conflicts:H2->H3",
          ),
        ),
      ).toBe(true);
    });
  });
});
