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
          "--until-horizon",
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
});
