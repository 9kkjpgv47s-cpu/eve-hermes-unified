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
});
