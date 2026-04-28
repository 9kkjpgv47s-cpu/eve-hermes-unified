import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "goal-policy-file-validation-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedHorizonStatus(statusPath: string): Promise<void> {
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "goal policy file validation fixture",
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
          {
            id: "h2-action-1",
            summary: "seed",
            targetHorizon: "H2",
            status: "completed",
            tags: ["durability"],
          },
          {
            id: "h3-action-1",
            summary: "seed",
            targetHorizon: "H3",
            status: "planned",
            tags: ["durability"],
          },
        ],
        goalPolicies: {
          transitions: {
            "H2->H3": {
              minimumGoalIncrease: 1,
              minActionGrowthFactor: 1.1,
              minPendingNextActions: 2,
              requiredTaggedActionCounts: {
                durability: {
                  minCount: 1,
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
  goalPolicyPath: string,
  options?: { includeH3H4?: boolean; includeH4H5?: boolean },
): Promise<void> {
  const includeH3H4 = options?.includeH3H4 ?? true;
  const includeH4H5 = options?.includeH4H5 ?? true;
  const transitions: Record<string, unknown> = {
    "H2->H3": {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.1,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: {
        durability: {
          minCount: 1,
          minPendingCount: 1,
        },
      },
    },
  };
  if (includeH3H4) {
    transitions["H3->H4"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: {
        policy: 1,
      },
    };
  }
  if (includeH4H5) {
    transitions["H4->H5"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 1,
      requiredTaggedActionCounts: {
        automation: 1,
      },
    };
  }
  await writeFile(
    goalPolicyPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        transitions,
      },
      null,
      2,
    ),
    "utf8",
  );
}

describe("validate-goal-policy-file.mjs", () => {
  it("passes for explicit valid goal policy file", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-file-validation.json");
      await seedHorizonStatus(statusPath);
      await seedGoalPolicyFile(goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-goal-policy-file.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H5",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { sourceWasFile: boolean; coveragePass: boolean };
        files: { goalPolicyFile: string | null };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.sourceWasFile).toBe(true);
      expect(payload.checks.coveragePass).toBe(true);
      expect(payload.files.goalPolicyFile).toBe(path.resolve(goalPolicyPath));
    });
  });

  it("passes when auto-discovered sibling GOAL_POLICIES.json exists", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-file-validation.json");
      await seedHorizonStatus(statusPath);
      await seedGoalPolicyFile(goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-goal-policy-file.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H5",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { sourceWasFile: boolean; sourceSelection: string | null };
        files: { goalPolicyFile: string | null };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.sourceWasFile).toBe(true);
      expect(payload.checks.sourceSelection).toBe("adjacent-default");
      expect(payload.files.goalPolicyFile).toBe(path.resolve(goalPolicyPath));
    });
  });

  it("fails when no policy file source is available", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "goal-policy-file-validation.json");
      await seedHorizonStatus(statusPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-goal-policy-file.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
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
      expect(payload.failures).toContain("goal_policy_source_not_file:horizon-status");
    });
  });

  it("fails when file source is present but coverage is incomplete", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-file-validation.json");
      await seedHorizonStatus(statusPath);
      await seedGoalPolicyFile(goalPolicyPath, { includeH3H4: false, includeH4H5: true });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-goal-policy-file.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H5",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { sourceWasFile: boolean; coveragePass: boolean };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.sourceWasFile).toBe(true);
      expect(payload.checks.coveragePass).toBe(false);
      expect(payload.failures).toContain("missing_transition_policy:H3->H4");
    });
  });

  it("fails when goal policy file has duplicate transition keys", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-file-validation.json");
      await seedHorizonStatus(statusPath);
      await writeFile(
        goalPolicyPath,
        `{
  "schemaVersion": "v1",
  "transitions": {
    "H2->H3": {
      "minimumGoalIncrease": 1,
      "minActionGrowthFactor": 1.1,
      "minPendingNextActions": 1,
      "requiredTaggedActionCounts": {
        "durability": {
          "minCount": 1,
          "minPendingCount": 1
        }
      }
    },
    "H2->H3": {
      "minimumGoalIncrease": 2,
      "minActionGrowthFactor": 1.2,
      "minPendingNextActions": 2,
      "requiredTaggedActionCounts": {
        "durability": {
          "minCount": 2,
          "minPendingCount": 1
        }
      }
    }
  }
}
`,
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-goal-policy-file.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
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
          failure.startsWith(
            "goal_policy_source_invalid:goal_policy_file_duplicate_transition_keys:H2->H3",
          ),
        ),
      ).toBe(true);
    });
  });

  it("fails when file and horizon-status overlap transition policies conflict", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-file-validation.json");
      await seedHorizonStatus(statusPath);
      await writeFile(
        goalPolicyPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            transitions: {
              "H2->H3": {
                minimumGoalIncrease: 5,
                minActionGrowthFactor: 2,
                minPendingNextActions: 5,
                requiredTaggedActionCounts: {
                  durability: {
                    minCount: 5,
                    minPendingCount: 5,
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

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-goal-policy-file.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H5",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          crossSourceConsistencyChecked: boolean;
          crossSourceConsistencyPass: boolean;
          crossSourceConflictTransitionKeys: string[] | null;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.crossSourceConsistencyChecked).toBe(true);
      expect(payload.checks.crossSourceConsistencyPass).toBe(false);
      expect(payload.checks.crossSourceConflictTransitionKeys).toEqual(["H2->H3"]);
      expect(
        payload.failures.some((failure) =>
          failure.startsWith("goal_policy_source_invalid:goal_policy_source_transition_conflicts:H2->H3"),
        ),
      ).toBe(true);
    });
  });
});
