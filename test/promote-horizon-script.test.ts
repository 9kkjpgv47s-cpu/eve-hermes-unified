import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "promote-horizon-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedCloseoutReport(
  evidenceDir: string,
  options?: { pass?: boolean; horizon?: string; nextHorizon?: string },
): Promise<string> {
  await mkdir(evidenceDir, { recursive: true });
  const reportPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: options?.pass ?? true,
        closeout: {
          horizon: options?.horizon ?? "H2",
          nextHorizon: options?.nextHorizon ?? "H3",
          canCloseHorizon: options?.pass ?? true,
          canStartNextHorizon: false,
        },
        checks: {
          horizonValidationPass: true,
          nextActions: [{ id: "h2-action-1", completed: true }],
          requiredEvidence: [{ id: "h2-drill-suite", pass: true }],
        },
        failures: options?.pass === false ? ["synthetic_closeout_failure"] : [],
      },
      null,
      2,
    ),
    "utf8",
  );
  return reportPath;
}

async function seedHorizonStatus(statusPath: string): Promise<void> {
  await writeFile(
    statusPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: "2026-04-26T21:40:00Z",
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "H2 active",
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
        nextActions: [
          {
            id: "h2-action-1",
            summary: "seed action",
            targetHorizon: "H2",
            status: "completed",
          },
          {
            id: "h2-action-2",
            summary: "second seed action",
            targetHorizon: "H2",
            status: "completed",
            tags: ["rollback"],
          },
          {
            id: "h3-action-1",
            summary: "h3 policy seed one",
            targetHorizon: "H3",
            status: "planned",
            tags: ["durability", "policy"],
          },
          {
            id: "h3-action-2",
            summary: "h3 policy seed two",
            targetHorizon: "H3",
            status: "planned",
            tags: ["durability"],
          },
          {
            id: "h3-action-3",
            summary: "h3 policy seed three",
            targetHorizon: "H3",
            status: "planned",
            tags: ["policy"],
          },
        ],
        goalPolicies: {
          transitions: {
            "H2->H3": {
              minimumGoalIncrease: 1,
              minActionGrowthFactor: 1.2,
              minPendingNextActions: 2,
              requiredTaggedActionCounts: {
                durability: {
                  minCount: 2,
                  minPendingCount: 1,
                },
              },
            },
          },
        },
        promotionReadiness: {
          targetStage: "canary",
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
            timestamp: "2026-04-26T21:40:00Z",
            horizon: "H2",
            status: "in_progress",
            note: "seed H2 active",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function seedHorizonStatusWithoutFuturePolicies(statusPath: string): Promise<void> {
  const payload = JSON.parse(await readFile(statusPath, "utf8")) as {
    goalPolicies?: { transitions?: Record<string, unknown> };
  };
  if (
    payload.goalPolicies &&
    payload.goalPolicies.transitions &&
    typeof payload.goalPolicies.transitions === "object"
  ) {
    const transition = payload.goalPolicies.transitions["H2->H3"] as
      | { minPendingNextActions?: number; requiredTaggedActionCounts?: Record<string, unknown> }
      | undefined;
    if (transition && typeof transition === "object") {
      transition.minPendingNextActions = 0;
      transition.requiredTaggedActionCounts = {};
      payload.goalPolicies.transitions["H2->H3"] = transition;
    }
  }
  await writeFile(statusPath, JSON.stringify(payload, null, 2), "utf8");
}

describe("promote-horizon.mjs", () => {
  it("enforces goal policy readiness audit gate when required", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      const auditOut = path.join(evidenceDir, "goal-policy-readiness-audit.json");
      await seedHorizonStatus(statusPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--require-goal-policy-readiness-audit",
          "--goal-policy-readiness-audit-out",
          auditOut,
          "--goal-policy-readiness-audit-max-target-horizon",
          "H5",
          "--require-goal-policy-readiness-tagged-targets",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { goalPolicyReadinessAuditPass: boolean; requireGoalPolicyReadinessAudit: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.requireGoalPolicyReadinessAudit).toBe(true);
      expect(payload.checks.goalPolicyReadinessAuditPass).toBe(true);
    });
  });

  it("fails promotion when required goal policy readiness audit fails", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await seedHorizonStatusWithoutFuturePolicies(statusPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--require-goal-policy-readiness-audit",
          "--goal-policy-readiness-audit-max-target-horizon",
          "H3",
          "--require-goal-policy-readiness-tagged-targets",
          "--require-goal-policy-readiness-positive-pending-min",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      if (result.code !== 2) {
        throw new Error(
          `expected readiness-audit-gated failure (code 2), got ${String(result.code)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures.length).toBeGreaterThan(0);
    });
  });

  it("promotes horizon when closeout evidence passes", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--evidence-dir",
          evidenceDir,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--out",
          outPath,
          "--note",
          "Promoted by integration test",
        ],
        { timeoutMs: 40_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `promote-horizon expected success, got ${String(result.code)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);

      const promotionPayload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { statusUpdated: boolean; activeAdvanced: boolean };
      };
      expect(promotionPayload.pass).toBe(true);
      expect(promotionPayload.checks.statusUpdated).toBe(true);
      expect(promotionPayload.checks.activeAdvanced).toBe(true);

      const statusPayload = JSON.parse(await readFile(statusPath, "utf8")) as {
        activeHorizon: string;
        activeStatus: string;
        horizonStates: Record<string, { status: string; summary: string }>;
      };
      expect(statusPayload.activeHorizon).toBe("H3");
      expect(statusPayload.activeStatus).toBe("in_progress");
      expect(statusPayload.horizonStates.H2.status).toBe("completed");
      expect(statusPayload.horizonStates.H3.status).toBe("in_progress");
    });
  });

  it("fails promotion when closeout evidence is failing", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await seedCloseoutReport(evidenceDir, { pass: false, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--evidence-dir",
          evidenceDir,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);

      const promotionPayload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(promotionPayload.pass).toBe(false);
      expect(promotionPayload.failures).toContain("closeout_not_passed");

      const statusPayload = JSON.parse(await readFile(statusPath, "utf8")) as {
        activeHorizon: string;
        activeStatus: string;
      };
      expect(statusPayload.activeHorizon).toBe("H2");
      expect(statusPayload.activeStatus).toBe("in_progress");
    });
  });

  it("supports dry-run without mutating horizon status", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const before = await readFile(statusPath, "utf8");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--evidence-dir",
          evidenceDir,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--out",
          outPath,
          "--dry-run",
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        dryRun: boolean;
        checks: { statusUpdated: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.dryRun).toBe(true);
      expect(payload.checks.statusUpdated).toBe(false);

      const after = await readFile(statusPath, "utf8");
      expect(after).toBe(before);
    });
  });

  it("uses run:h2-closeout manifest for deterministic promotion handoff", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      const closeoutPath = await seedCloseoutReport(evidenceDir, {
        pass: true,
        horizon: "H2",
        nextHorizon: "H3",
      });
      await seedHorizonStatus(statusPath);
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-000000.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            files: {
              closeoutOut: closeoutPath,
            },
            checks: {
              h2CloseoutGatePass: true,
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
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-run-file",
          closeoutRunPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      if (result.code !== 0) {
        throw new Error(
          `promote-horizon via closeout run expected success, got ${String(result.code)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { closeoutRunFile: string | null; closeoutFile: string };
        checks: { closeoutRunPass: boolean };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.closeoutRunFile).toBe(closeoutRunPath);
      expect(payload.files.closeoutFile).toBe(closeoutPath);
      expect(payload.checks.closeoutRunPass).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("enforces goal policy key during progressive-goals gate", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--require-progressive-goals",
          "--goal-policy-key",
          "H2->H3",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { progressiveGoalsPass: boolean; goalPolicyKey: string | null };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.progressiveGoalsPass).toBe(true);
      expect(payload.checks.goalPolicyKey).toBe("H2->H3");
      expect(payload.failures).toEqual([]);
    });
  });

  it("enforces goal policy coverage gate when required", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--require-goal-policy-coverage",
          "--goal-policy-coverage-until-horizon",
          "H5",
          "--required-policy-transitions",
          "H2->H3",
          "--require-policy-tagged-targets",
          "--require-positive-pending-policy-min",
          "--goal-policy-key",
          "H2->H3",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: { goalPolicyCoveragePass: boolean; requireGoalPolicyCoverage: boolean };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
      expect(payload.checks.requireGoalPolicyCoverage).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });
});
