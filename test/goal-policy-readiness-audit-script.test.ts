import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "goal-policy-readiness-audit-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedHorizonStatus(
  statusPath: string,
  options?: { withH3H4?: boolean; withH4H5?: boolean; tagged?: boolean },
): Promise<void> {
  const withH3H4 = options?.withH3H4 ?? true;
  const withH4H5 = options?.withH4H5 ?? true;
  const tagged = options?.tagged ?? true;
  const transitions: Record<string, unknown> = {
    "H2->H3": {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.1,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: tagged ? { durability: 1 } : undefined,
    },
  };
  if (withH3H4) {
    transitions["H3->H4"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: tagged ? { policy: { minCount: 1, minPendingCount: 1 } } : undefined,
    };
  }
  if (withH4H5) {
    transitions["H4->H5"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.05,
      minPendingNextActions: 1,
      requiredTaggedActionCounts: tagged ? { automation: 1 } : undefined,
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
        summary: "audit fixture",
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
          { id: "h2-a1", summary: "h2", targetHorizon: "H2", status: "completed", tags: ["durability"] },
          { id: "h3-a1", summary: "h3", targetHorizon: "H3", status: "planned", tags: ["durability"] },
          { id: "h4-a1", summary: "h4", targetHorizon: "H4", status: "planned", tags: ["policy"] },
          { id: "h5-a1", summary: "h5", targetHorizon: "H5", status: "planned", tags: ["automation"] },
        ],
        goalPolicies: {
          transitions,
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

          H14: { status: "planned", summary: "H14 planned" },
          H15: { status: "planned", summary: "H15 planned" },
          H16: { status: "planned", summary: "H16 planned" },
          H17: { status: "planned", summary: "H17 planned" },
          H18: { status: "planned", summary: "H18 planned" },
          H19: { status: "planned", summary: "H19 planned" },
          H20: { status: "planned", summary: "H20 planned" },
          H21: { status: "planned", summary: "H21 planned" },
          H22: { status: "planned", summary: "H22 planned" },
          H23: { status: "planned", summary: "H23 planned" },
          H24: { status: "planned", summary: "H24 planned" },
          H25: { status: "planned", summary: "H25 planned" },
          H26: { status: "planned", summary: "H26 planned" },
          H27: { status: "planned", summary: "H27 planned" },
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

async function seedGoalPolicyFile(goalPolicyPath: string): Promise<void> {
  await writeFile(
    goalPolicyPath,
    JSON.stringify(
      {
        transitions: {
          "H2->H3": {
            minimumGoalIncrease: 1,
            minActionGrowthFactor: 1.1,
            minPendingNextActions: 2,
            requiredTaggedActionCounts: {
              durability: 1,
            },
          },
          "H3->H4": {
            minimumGoalIncrease: 1,
            minActionGrowthFactor: 1.05,
            minPendingNextActions: 2,
            requiredTaggedActionCounts: {
              policy: { minCount: 1, minPendingCount: 1 },
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

async function seedConflictingGoalPolicyFile(goalPolicyPath: string): Promise<void> {
  await writeFile(
    goalPolicyPath,
    JSON.stringify(
      {
        transitions: {
          "H2->H3": {
            minimumGoalIncrease: 99,
            minActionGrowthFactor: 4.2,
            minPendingNextActions: 7,
            requiredTaggedActionCounts: {
              conflicting: { minCount: 5, minPendingCount: 4 },
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

async function seedMatchingGoalPolicyAndHorizonStatus(
  statusPath: string,
  goalPolicyPath: string,
): Promise<void> {
  const statusPayload = JSON.parse(await readFile(statusPath, "utf8")) as {
    goalPolicies?: { transitions?: Record<string, unknown> };
  };
  const sharedTransition = {
    minimumGoalIncrease: 1,
    minActionGrowthFactor: 1.1,
    minPendingNextActions: 2,
    requiredTaggedActionCounts: {
      durability: 1,
    },
  };
  if (!statusPayload.goalPolicies || typeof statusPayload.goalPolicies !== "object") {
    statusPayload.goalPolicies = { transitions: {} };
  }
  if (!statusPayload.goalPolicies.transitions || typeof statusPayload.goalPolicies.transitions !== "object") {
    statusPayload.goalPolicies.transitions = {};
  }
  statusPayload.goalPolicies.transitions["H2->H3"] = sharedTransition;
  await writeFile(statusPath, JSON.stringify(statusPayload, null, 2), "utf8");
  await writeFile(
    goalPolicyPath,
    JSON.stringify(
      {
        transitions: {
          "H2->H3": sharedTransition,
          "H3->H4": {
            minimumGoalIncrease: 1,
            minActionGrowthFactor: 1.05,
            minPendingNextActions: 2,
            requiredTaggedActionCounts: {
              policy: { minCount: 1, minPendingCount: 1 },
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

describe("audit-goal-policy-readiness.mjs", () => {
  it("passes with complete future coverage and tagged requirements", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "goal-policy-readiness.json");
      await seedHorizonStatus(statusPath, { withH3H4: true, withH4H5: true, tagged: true });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/audit-goal-policy-readiness.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H5",
          "--require-tagged-targets",
          "--out",
          outPath,
        ],
        { timeoutMs: 30_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { coverageRate: number; matrix: Record<string, { failures: string[] }> };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.coverageRate).toBe(1);
      expect(Object.values(payload.checks.matrix).flatMap((entry) => entry.failures)).toEqual([]);
    });
  });

  it("fails when future transition coverage is incomplete", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(dir, "goal-policy-readiness.json");
      await seedHorizonStatus(statusPath, { withH3H4: false, withH4H5: true, tagged: true });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/audit-goal-policy-readiness.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H5",
          "--require-tagged-targets",
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

  it("supports explicit goal policy file source", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY.json");
      const outPath = path.join(dir, "goal-policy-readiness.json");
      await seedHorizonStatus(statusPath, { withH3H4: false, withH4H5: false, tagged: false });
      await seedMatchingGoalPolicyAndHorizonStatus(statusPath, goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/audit-goal-policy-readiness.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
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
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.goalPolicySource).toBe("file");
      expect(payload.files.goalPolicyFile).toBe(path.resolve(goalPolicyPath));
    });
  });

  it("auto-detects GOAL_POLICIES.json next to horizon status", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-readiness.json");
      await seedHorizonStatus(statusPath, { withH3H4: false, withH4H5: false, tagged: false });
      await seedMatchingGoalPolicyAndHorizonStatus(statusPath, goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/audit-goal-policy-readiness.mjs",
          "--horizon-status-file",
          statusPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
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
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.goalPolicySource).toBe("file");
      expect(payload.files.goalPolicyFile).toBe(path.resolve(goalPolicyPath));
    });
  });

  it("fails when goal policy file has duplicate transition keys", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-readiness.json");
      await seedHorizonStatus(statusPath, { withH3H4: false, withH4H5: false, tagged: false });
      await writeFile(
        goalPolicyPath,
        `{
  "transitions": {
    "H2->H3": {
      "minimumGoalIncrease": 1,
      "minActionGrowthFactor": 1.1,
      "minPendingNextActions": 2
    },
    "H2->H3": {
      "minimumGoalIncrease": 2,
      "minActionGrowthFactor": 1.2,
      "minPendingNextActions": 3
    }
  }
}
`,
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/audit-goal-policy-readiness.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H3",
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
          failure.includes("goal_policy_source_error:goal_policy_file_duplicate_transition_keys:H2->H3"),
        ),
      ).toBe(true);
    });
  });

  it("fails when explicit goal policy file conflicts with horizon-status overlapping transition policy", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(dir, "goal-policy-readiness.json");
      await seedHorizonStatus(statusPath, { withH3H4: true, withH4H5: true, tagged: true });
      await seedConflictingGoalPolicyFile(goalPolicyPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/audit-goal-policy-readiness.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--source-horizon",
          "H2",
          "--until-horizon",
          "H3",
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
          failure.includes("goal_policy_source_error:goal_policy_source_transition_conflicts:H2->H3"),
        ),
      ).toBe(true);
    });
  });
});
