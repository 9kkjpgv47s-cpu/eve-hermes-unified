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
          H28: { status: "planned", summary: "H28 planned" },
          H29: { status: "planned", summary: "H29 planned" },
          H30: { status: "planned", summary: "H30 planned" },
          H31: { status: "planned", summary: "H31 planned" },
          H32: { status: "planned", summary: "H32 planned" },
          H33: { status: "planned", summary: "H33 planned" },
          H34: { status: "planned", summary: "H34 planned" },
          H35: { status: "planned", summary: "H35 planned" },
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

async function seedHorizonStatusH3(statusPath: string): Promise<void> {
  await seedHorizonStatus(statusPath);
  const payload = JSON.parse(await readFile(statusPath, "utf8")) as {
    activeHorizon?: string;
    activeStatus?: string;
    summary?: string;
    horizonStates?: Record<string, { status: string; summary: string }>;
  };
  payload.activeHorizon = "H3";
  payload.activeStatus = "in_progress";
  payload.summary = "H3 active";
  payload.horizonStates = payload.horizonStates ?? {};
  payload.horizonStates.H2 = { status: "completed", summary: "H2 complete" };
  payload.horizonStates.H3 = { status: "in_progress", summary: "H3 active" };
  await writeFile(statusPath, JSON.stringify(payload, null, 2), "utf8");
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

async function seedGoalPolicyFile(
  goalPolicyPath: string,
  options?: { includeH2H3?: boolean },
): Promise<void> {
  const includeH2H3 = options?.includeH2H3 ?? true;
  const transitions: Record<string, unknown> = {};
  if (includeH2H3) {
    transitions["H2->H3"] = {
      minimumGoalIncrease: 1,
      minActionGrowthFactor: 1.2,
      minPendingNextActions: 2,
      requiredTaggedActionCounts: {
        durability: {
          minCount: 2,
          minPendingCount: 1,
        },
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

async function seedConflictingGoalPolicyAndHorizonStatus(
  statusPath: string,
  goalPolicyPath: string,
): Promise<void> {
  const statusPayload = JSON.parse(await readFile(statusPath, "utf8")) as {
    goalPolicies?: { transitions?: Record<string, unknown> };
  };
  statusPayload.goalPolicies = statusPayload.goalPolicies ?? { transitions: {} };
  statusPayload.goalPolicies.transitions = statusPayload.goalPolicies.transitions ?? {};
  statusPayload.goalPolicies.transitions["H2->H3"] = {
    minimumGoalIncrease: 7,
    minActionGrowthFactor: 2.5,
    minPendingNextActions: 5,
    requiredTaggedActionCounts: {
      durability: {
        minCount: 7,
        minPendingCount: 5,
      },
    },
  };
  await writeFile(statusPath, JSON.stringify(statusPayload, null, 2), "utf8");

  await seedGoalPolicyFile(goalPolicyPath, { includeH2H3: true });
}

async function seedGoalPolicyFileWithDuplicateTransition(goalPolicyPath: string): Promise<void> {
  const duplicateTransitionPayload = `{
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
      "minActionGrowthFactor": 1.25,
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
`;
  await writeFile(goalPolicyPath, duplicateTransitionPayload, "utf8");
}

async function removeGoalPoliciesFromStatus(statusPath: string): Promise<void> {
  const payload = JSON.parse(await readFile(statusPath, "utf8")) as { goalPolicies?: unknown };
  delete payload.goalPolicies;
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
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: closeoutPath,
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
        checks: {
          closeoutRunPass: boolean;
          closeoutRunSupervisedSimulationPass: boolean;
          closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported: boolean;
          closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.closeoutRunFile).toBe(closeoutRunPath);
      expect(payload.files.closeoutFile).toBe(closeoutPath);
      expect(payload.checks.closeoutRunPass).toBe(true);
      expect(payload.checks.closeoutRunSupervisedSimulationPass).toBe(true);
      expect(payload.checks.closeoutRunSupervisedSimulationStageGoalPolicyPropagationReported).toBe(
        true,
      );
      expect(payload.checks.closeoutRunSupervisedSimulationStageGoalPolicyPropagationPassed).toBe(
        true,
      );
      expect(payload.failures).toEqual([]);
    });
  });

  it("fails when closeout run omits supervised simulation stage goal-policy propagation", async () => {
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
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: closeoutPath,
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: false,
              supervisedSimulationStageGoalPolicyPropagationPassed: false,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: false,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: false,
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
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunSupervisedSimulationStageGoalPolicyPropagationPass: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunSupervisedSimulationStageGoalPolicyPropagationPass).toBe(
        false,
      );
      expect(payload.failures).toContain(
        "closeout_run_supervised_simulation_stage_goal_policy_propagation_not_reported",
      );
    });
  });

  it("fails when closeout run omits h2 closeout gate pass signal", async () => {
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
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-100000.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: closeoutPath,
            },
            checks: {
              h2CloseoutGatePass: false,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunCloseoutGatePass: boolean;
          closeoutRunH2CloseoutGatePass: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunCloseoutGatePass).toBe(false);
      expect(payload.checks.closeoutRunH2CloseoutGatePass).toBe(false);
      expect(payload.failures).toContain("closeout_run_horizon_closeout_gate_not_passed");
      expect(payload.failures).toContain("closeout_run_h2_closeout_gate_not_passed");
    });
  });

  it("dual-reports h2 closeout gate failure aliases when promoting from H3", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      const closeoutPath = await seedCloseoutReport(evidenceDir, {
        pass: true,
        horizon: "H3",
        nextHorizon: "H4",
      });
      await seedHorizonStatusH3(statusPath);
      const closeoutRunPath = path.join(evidenceDir, "h3-closeout-run-20260426-150000.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H3",
              next: "H4",
            },
            files: {
              closeoutOut: closeoutPath,
            },
            checks: {
              horizonCloseoutGatePass: false,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
          "--horizon",
          "H3",
          "--next-horizon",
          "H4",
          "--horizon-status-file",
          statusPath,
          "--closeout-run-file",
          closeoutRunPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("closeout_run_horizon_closeout_gate_not_passed");
      expect(payload.failures).toContain("closeout_run_h2_closeout_gate_not_passed");
    });
  });

  it("fails when closeout run horizon transition does not match promotion request", async () => {
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
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-200000.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H1",
              next: "H2",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: closeoutPath,
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
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--horizon-status-file",
          statusPath,
          "--closeout-run-file",
          closeoutRunPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("closeout_run_horizon_source_mismatch:H1!=H2");
      expect(payload.failures).toContain("closeout_run_horizon_next_mismatch:H2!=H3");
    });
  });

it("fails when closeout run reports conflicting source horizon aliases via checks", async () => {
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
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-201000.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              sourceHorizon: "H1",
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: closeoutPath,
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
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--horizon-status-file",
          statusPath,
          "--closeout-run-file",
          closeoutRunPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunHorizonSourceInvalid: boolean;
          closeoutRunHorizonSourceInvalidValues: string[] | null;
          closeoutRunHorizonSourceAliasConflict: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceInvalid).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceInvalidValues).toBeNull();
      expect(payload.checks.closeoutRunHorizonSourceAliasConflict).toBe(true);
      expect(payload.failures).toContain("closeout_run_horizon_source_alias_conflict");
    });
  });

  it("fails when closeout run reports invalid source horizon alias token", async () => {
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
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-201025.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              sourceHorizon: "HX",
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: closeoutPath,
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
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--horizon-status-file",
          statusPath,
          "--closeout-run-file",
          closeoutRunPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunHorizonSourceInvalid: boolean;
          closeoutRunHorizonSourceInvalidValues: string[] | null;
          closeoutRunHorizonSourceAliasConflict: boolean;
          closeoutRunHorizonSourceMatches: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceInvalid).toBe(true);
      expect(payload.checks.closeoutRunHorizonSourceInvalidValues).toContain("HX");
      expect(payload.checks.closeoutRunHorizonSourceAliasConflict).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceMatches).toBe(true);
      expect(payload.failures).toContain("closeout_run_horizon_source_invalid");
    });
  });

  it("fails when closeout artifact reports invalid source horizon alias token", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);

      await mkdir(evidenceDir, { recursive: true });
      const invalidCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-invalid-source.json");
      await writeFile(
        invalidCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              sourceHorizon: "UNKNOWN_SOURCE",
              nextHorizon: "H3",
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-201060.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: invalidCloseoutPath,
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
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutHorizonSourceInvalid: boolean;
          closeoutHorizonSourceInvalidValues: string[] | null;
          closeoutHorizonSourceAliasConflict: boolean;
          closeoutHorizonSourceMatches: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutHorizonSourceInvalid).toBe(true);
      expect(payload.checks.closeoutHorizonSourceInvalidValues).toContain("UNKNOWN_SOURCE");
      expect(payload.checks.closeoutHorizonSourceAliasConflict).toBe(false);
      expect(payload.checks.closeoutHorizonSourceMatches).toBe(true);
      expect(payload.failures).toContain("closeout_horizon_source_invalid");
    });
  });

  it("fails when closeout run reports conflicting source horizon aliases via top-level sourceHorizon", async () => {
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
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-201050.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            sourceHorizon: "H1",
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: closeoutPath,
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
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--horizon-status-file",
          statusPath,
          "--closeout-run-file",
          closeoutRunPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunHorizonSourceInvalid: boolean;
          closeoutRunHorizonSourceInvalidValues: string[] | null;
          closeoutRunHorizonSourceAliasConflict: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceInvalid).toBe(false);
      expect(payload.checks.closeoutRunHorizonSourceInvalidValues).toBeNull();
      expect(payload.checks.closeoutRunHorizonSourceAliasConflict).toBe(true);
      expect(payload.failures).toContain("closeout_run_horizon_source_alias_conflict");
    });
  });

  it("fails when closeout run and closeout artifact transitions disagree", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);

      await mkdir(evidenceDir, { recursive: true });
      const mismatchedCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-mismatch.json");
      await writeFile(
        mismatchedCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H4",
            },
            checks: {
              nextHorizon: {
                selectedNextHorizon: "H4",
              },
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-300000.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: mismatchedCloseoutPath,
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunHorizonNextMatches: boolean;
          closeoutHorizonNextMatches: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunHorizonNextMatches).toBe(true);
      expect(payload.checks.closeoutHorizonNextMatches).toBe(false);
      expect(payload.failures).toContain("closeout_run_closeout_horizon_next_disagreement:H3!=H4");
    });
  });

  it("fails when closeout artifact reports conflicting next horizon aliases", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);

      await mkdir(evidenceDir, { recursive: true });
      const conflictingCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-conflicting-next.json");
      await writeFile(
        conflictingCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
              targetNextHorizon: "H4",
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-201100.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: conflictingCloseoutPath,
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
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutHorizonNextInvalid: boolean;
          closeoutHorizonNextInvalidValues: string[] | null;
          closeoutHorizonNextAliasConflict: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutHorizonNextInvalid).toBe(false);
      expect(payload.checks.closeoutHorizonNextInvalidValues).toBeNull();
      expect(payload.checks.closeoutHorizonNextAliasConflict).toBe(true);
      expect(payload.failures).toContain("closeout_horizon_next_alias_conflict");
    });
  });

  it("fails when closeout artifact reports invalid next horizon alias token", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);

      await mkdir(evidenceDir, { recursive: true });
      const invalidCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-invalid-next.json");
      await writeFile(
        invalidCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
              targetNextHorizon: "INVALID",
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );
      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-201120.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
            },
            files: {
              closeoutOut: invalidCloseoutPath,
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
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutHorizonNextInvalid: boolean;
          closeoutHorizonNextInvalidValues: string[] | null;
          closeoutHorizonNextAliasConflict: boolean;
          closeoutHorizonNextMatches: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutHorizonNextInvalid).toBe(true);
      expect(payload.checks.closeoutHorizonNextInvalidValues).toContain("INVALID");
      expect(payload.checks.closeoutHorizonNextAliasConflict).toBe(false);
      expect(payload.checks.closeoutHorizonNextMatches).toBe(true);
      expect(payload.failures).toContain("closeout_horizon_next_invalid");
    });
  });

  it("fails when closeout run reports conflicting closeout artifact aliases", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);

      await mkdir(evidenceDir, { recursive: true });
      const canonicalCloseoutPath = path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json");
      await writeFile(
        canonicalCloseoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
            checks: {
              nextHorizon: {
                selectedNextHorizon: "H3",
              },
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(evidenceDir, "h2-closeout-run-20260426-310000.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: canonicalCloseoutPath,
              closeoutFile: path.join(evidenceDir, "horizon-closeout-H2-conflict.json"),
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutRunCloseoutOutAliasesConsistent: boolean | null;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutRunCloseoutOutAliasesConsistent).toBe(false);
      expect(payload.failures).toContain("closeout_run_closeout_out_alias_conflict");
    });
  });

  it("resolves relative closeout artifact paths against closeout-run manifest directory", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);

      const runBundleDir = path.join(dir, "bundle");
      const nestedEvidenceDir = path.join(runBundleDir, "evidence");
      await mkdir(nestedEvidenceDir, { recursive: true });
      const closeoutPath = path.join(nestedEvidenceDir, "horizon-closeout-H2-relative.json");
      await writeFile(
        closeoutPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
            },
            checks: {
              nextHorizon: {
                selectedNextHorizon: "H3",
              },
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const closeoutRunPath = path.join(runBundleDir, "h2-closeout-run-relative.json");
      await writeFile(
        closeoutRunPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H2",
              next: "H3",
            },
            files: {
              closeoutOut: "evidence/horizon-closeout-H2-relative.json",
            },
            checks: {
              h2CloseoutGatePass: true,
              supervisedSimulationPass: true,
              supervisedSimulationStageGoalPolicyPropagationReported: true,
              supervisedSimulationStageGoalPolicyPropagationPassed: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationReported: true,
              supervisedSimulationStageGoalPolicySourceConsistencyPropagationPassed: true,
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
          `promote-horizon relative closeout path expected success, got ${String(result.code)}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
      }
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { closeoutFile: string };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.closeoutFile).toBe(closeoutPath);
    });
  });

  it("fails when pinned closeout report transition does not match promotion request", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      const closeoutPath = await seedCloseoutReport(evidenceDir, {
        pass: true,
        horizon: "H1",
        nextHorizon: "H2",
      });
      await seedHorizonStatus(statusPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon",
          "H2",
          "--next-horizon",
          "H3",
          "--horizon-status-file",
          statusPath,
          "--closeout-file",
          closeoutPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          closeoutSourceHorizon: string | null;
          closeoutNextHorizon: string | null;
          closeoutHorizonSourceMatches: boolean | null;
          closeoutHorizonNextMatches: boolean | null;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.closeoutSourceHorizon).toBe("H1");
      expect(payload.checks.closeoutNextHorizon).toBe("H2");
      expect(payload.checks.closeoutHorizonSourceMatches).toBe(false);
      expect(payload.checks.closeoutHorizonNextMatches).toBe(false);
      expect(payload.failures).toContain("closeout_horizon_source_mismatch:H1!=H2");
      expect(payload.failures).toContain("closeout_horizon_next_mismatch:H2!=H3");
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
        checks: {
          goalPolicyCoveragePass: boolean;
          requireGoalPolicyCoverage: boolean;
          requiredPolicyTransitions: string | null;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
      expect(payload.checks.requireGoalPolicyCoverage).toBe(true);
      expect(payload.checks.requiredPolicyTransitions).toBe("H2->H3");
      expect(payload.failures).toEqual([]);
    });
  });

  it("enables strict goal-policy gates with one flag", async () => {
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
          "--goal-policy-key",
          "H2->H3",
          "--strict-goal-policy-gates",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          requireProgressiveGoals: boolean;
          progressiveGoalsPass: boolean;
          strictGoalPolicyGates: boolean;
          requireGoalPolicyCoverage: boolean;
          goalPolicyCoveragePass: boolean;
          goalPolicyCoverageUntilHorizon: string | null;
          requiredPolicyTransitions: string | null;
          requireGoalPolicyReadinessAudit: boolean;
          goalPolicyReadinessAuditPass: boolean;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks.strictGoalPolicyGates).toBe(true);
      expect(payload.checks.requireProgressiveGoals).toBe(true);
      expect(payload.checks.progressiveGoalsPass).toBe(true);
      expect(payload.checks.requireGoalPolicyCoverage).toBe(true);
      expect(payload.checks.goalPolicyCoveragePass).toBe(true);
      expect(payload.checks.goalPolicyCoverageUntilHorizon).toBe("H3");
      expect(payload.checks.requiredPolicyTransitions).toBe("H2->H3");
      expect(payload.checks.requireGoalPolicyReadinessAudit).toBe(true);
      expect(payload.checks.goalPolicyReadinessAuditPass).toBe(true);
      expect(payload.failures).toEqual([]);
    });
  });

  it("uses external goal-policy file when provided", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await seedGoalPolicyFile(goalPolicyPath, { includeH2H3: true });
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--strict-goal-policy-gates",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { goalPolicyFile: string | null };
        checks: { strictGoalPolicyGates: boolean; progressiveGoalsPass: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.goalPolicyFile).toBe(goalPolicyPath);
      expect(payload.checks.strictGoalPolicyGates).toBe(true);
      expect(payload.checks.progressiveGoalsPass).toBe(true);
    });
  });

  it("auto-discovers GOAL_POLICIES.json near horizon status when explicit file is omitted", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await removeGoalPoliciesFromStatus(statusPath);
      await seedGoalPolicyFile(goalPolicyPath, { includeH2H3: true });
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--strict-goal-policy-gates",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { goalPolicyFile: string | null };
        checks: { goalPolicyFile: string | null; strictGoalPolicyGates: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.goalPolicyFile).toBe(path.resolve(goalPolicyPath));
      expect(payload.checks.goalPolicyFile).toBe(path.resolve(goalPolicyPath));
      expect(payload.checks.strictGoalPolicyGates).toBe(true);
    });
  });

  it("runs goal policy file validation gate when required", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      const goalPolicyValidationOut = path.join(evidenceDir, "goal-policy-file-validation.json");
      await seedHorizonStatus(statusPath);
      await removeGoalPoliciesFromStatus(statusPath);
      await seedGoalPolicyFile(goalPolicyPath, { includeH2H3: true });
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--strict-goal-policy-gates",
          "--require-goal-policy-file-validation",
          "--goal-policy-file-validation-out",
          goalPolicyValidationOut,
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        files: { goalPolicyFileValidationOut: string | null };
        checks: { requireGoalPolicyFileValidation: boolean; goalPolicyFileValidationPass: boolean };
      };
      expect(payload.pass).toBe(true);
      expect(payload.files.goalPolicyFileValidationOut).toBe(goalPolicyValidationOut);
      expect(payload.checks.requireGoalPolicyFileValidation).toBe(true);
      expect(payload.checks.goalPolicyFileValidationPass).toBe(true);
    });
  });

  it("fails when required goal policy file validation gate fails", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICIES.json");
      const outPath = path.join(evidenceDir, "horizon-promotion.json");
      await seedHorizonStatus(statusPath);
      await removeGoalPoliciesFromStatus(statusPath);
      await seedGoalPolicyFile(goalPolicyPath, { includeH2H3: false });
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--require-goal-policy-file-validation",
          "--goal-policy-validation-until-horizon",
          "H3",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.failures).toContain("goal_policy_file_validation_gate_failed");
    });
  });

  it("fails strict promotion when goal policy file has duplicate transition keys", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion-duplicate-policy.json");
      await seedHorizonStatus(statusPath);
      await seedGoalPolicyFileWithDuplicateTransition(goalPolicyPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--strict-goal-policy-gates",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
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
            "goal_policy_source_invalid:goal_policy_file_duplicate_transition_keys:",
          ),
        ),
      ).toBe(true);
    });
  });

  it("fails strict promotion when external goal policy conflicts with horizon status fallback transition", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      const goalPolicyPath = path.join(dir, "GOAL_POLICY_STATUS.json");
      const outPath = path.join(evidenceDir, "horizon-promotion-conflicting-policy-source.json");
      await seedHorizonStatus(statusPath);
      await seedConflictingGoalPolicyAndHorizonStatus(statusPath, goalPolicyPath);
      await seedCloseoutReport(evidenceDir, { pass: true, horizon: "H2", nextHorizon: "H3" });

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/promote-horizon.mjs",
          "--horizon-status-file",
          statusPath,
          "--goal-policy-file",
          goalPolicyPath,
          "--closeout-report",
          path.join(evidenceDir, "horizon-closeout-H2-20260426-000000.json"),
          "--strict-goal-policy-gates",
          "--out",
          outPath,
        ],
        { timeoutMs: 40_000 },
      );
      expect(result.code).toBe(2);
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        checks: {
          goalPolicySourceConsistencyChecked: boolean;
          goalPolicySourceConsistencyPass: boolean | null;
          goalPolicySourceConsistencyConflictTransitions: string[] | null;
        };
        failures: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.checks.goalPolicySourceConsistencyChecked).toBe(true);
      expect(payload.checks.goalPolicySourceConsistencyPass).toBe(false);
      expect(payload.checks.goalPolicySourceConsistencyConflictTransitions).toEqual(["H2->H3"]);
      expect(
        payload.failures.some((failure) =>
          failure.startsWith("goal_policy_source_invalid:goal_policy_source_transition_conflicts:H2->H3"),
        ),
      ).toBe(true);
    });
  });
});
