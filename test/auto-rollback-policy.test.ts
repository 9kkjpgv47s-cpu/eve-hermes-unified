import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";
import packageJson from "../package.json" with { type: "json" };

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "auto-rollback-policy-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function seedEvidence(
  evidenceDir: string,
  options?: {
    successRate?: number;
    p95LatencyMs?: number;
    missingTraceRate?: number;
    unclassifiedFailures?: number;
    releasePass?: boolean;
    cutoverPass?: boolean;
    stagePromotionPass?: boolean;
    includeCooldownSignals?: boolean;
  },
): Promise<{
  validationPath: string;
  releasePath: string;
  cutoverPath: string;
  stagePromotionPath: string;
}> {
  await mkdir(evidenceDir, { recursive: true });
  const stamp = "20260426-000000";
  const validationPath = path.join(evidenceDir, `validation-summary-${stamp}.json`);
  const releasePath = path.join(evidenceDir, `release-readiness-${stamp}.json`);
  const cutoverPath = path.join(evidenceDir, `cutover-readiness-${stamp}.json`);
  const stagePromotionPath = path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`);

  const includeCooldownSignals = options?.includeCooldownSignals !== false;
  const failureInjectionPreview = includeCooldownSignals
    ? [
        {
          timestamp: new Date().toISOString(),
          responseClass: "fallback",
          failureClass: "cooldown",
          traceId: "trace-cooldown-1",
          durationMs: 101,
        },
        {
          timestamp: new Date().toISOString(),
          responseClass: "fallback",
          failureClass: "cooldown",
          traceId: "trace-cooldown-2",
          durationMs: 99,
        },
      ]
    : [];

  await writeFile(
    validationPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        metrics: {
          successRate: options?.successRate ?? 1,
          p95LatencyMs: options?.p95LatencyMs ?? 300,
          missingTraceRate: options?.missingTraceRate ?? 0,
          unclassifiedFailures: options?.unclassifiedFailures ?? 0,
          failureScenarioPassCount: 5,
        },
        gates: {
          passed:
            (options?.successRate ?? 1) >= 0.99 &&
            (options?.missingTraceRate ?? 0) <= 0 &&
            (options?.unclassifiedFailures ?? 0) <= 0 &&
            (options?.p95LatencyMs ?? 300) <= 2500,
          failures: [],
        },
        failureInjectionPreview,
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    releasePath,
    JSON.stringify(
      {
        readinessVersion: "v1",
        generatedAtIso: new Date().toISOString(),
        defaultValidationCommand: "validate:all",
        pass: options?.releasePass !== false,
        files: {
          validationSummary: validationPath,
          regression: null,
          cutoverReadiness: cutoverPath,
          failureInjection: null,
          soak: null,
          commandLogDir: null,
          commandsFile: null,
        },
        requiredArtifacts: [],
        releaseCommandLogs: [],
        checks: {
          validationSummaryPassed: true,
          regressionPassed: true,
          cutoverReadinessPassed: options?.cutoverPass !== false,
          commandLogsMissing: [],
          discoveredCommandLogs: [],
          requiredReleaseCommands: [],
          missingRequiredCommands: [],
          executedReleaseCommands: [],
          missingCommandLogFiles: [],
          commandFailures: [],
          validationCommandsPassed: true,
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    cutoverPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: options?.cutoverPass !== false,
      },
      null,
      2,
    ),
    "utf8",
  );

  await writeFile(
    stagePromotionPath,
    JSON.stringify(
      {
        generatedAtIso: new Date().toISOString(),
        pass: options?.stagePromotionPass !== false,
        stage: {
          current: "canary",
          target: "majority",
          transitionAllowed: true,
        },
        checks: {
          validationSummaryPassed: true,
          cutoverReadinessPassed: options?.cutoverPass !== false,
          releaseReadinessPassed: options?.releasePass !== false,
          mergeBundleValidationPassed: true,
          bundleVerificationPassed: true,
          horizonValidationPass: true,
          activeHorizon: "H2",
          activeStatus: "in_progress",
          stage: "majority",
        },
        failures: [],
      },
      null,
      2,
    ),
    "utf8",
  );

  return {
    validationPath,
    releasePath,
    cutoverPath,
    stagePromotionPath,
  };
}

async function seedHorizonStatus(horizonPath: string): Promise<void> {
  await writeFile(
    horizonPath,
    JSON.stringify(
      {
        schemaVersion: "v1",
        updatedAtIso: new Date().toISOString(),
        owner: "cloud-agent",
        activeHorizon: "H2",
        activeStatus: "in_progress",
        summary: "H2 rollback policy simulation",
        blockers: [],
        requiredEvidence: [
          {
            id: "h2-evidence-summary",
            command: "npm run validate:evidence-summary",
            artifactPattern: "evidence/validation-summary-*.json",
            required: true,
          },
          {
            id: "h2-release-readiness",
            command: "npm run validate:release-readiness",
            artifactPattern: "evidence/release-readiness-*.json",
            required: true,
          },
          {
            id: "h2-cutover-readiness",
            command: "npm run validate:cutover-readiness",
            artifactPattern: "evidence/cutover-readiness-*.json",
            required: true,
          },
        ],
        nextActions: [
          {
            id: "h2-action-1",
            summary: "run canary drill",
            targetHorizon: "H2",
            status: "in_progress",
          },
        ],
        promotionReadiness: {
          targetStage: "canary",
          gates: {
            releaseReadinessPass: true,
            mergeBundlePass: false,
            bundleVerificationPass: false,
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

describe("evaluate-auto-rollback-policy.mjs", () => {
  it("keeps the documented npm alias wired to the policy evaluator", () => {
    expect(packageJson.scripts["evaluate:auto-rollback-policy"]).toBe(
      "node ./scripts/evaluate-auto-rollback-policy.mjs",
    );
    expect(packageJson.scripts["evaluate:auto-rollback"]).toBe("npm run evaluate:auto-rollback-policy --");
  });

  it("holds traffic when metrics are healthy", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.997,
        p95LatencyMs: 900,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      if (result.code !== 0) {
        throw new Error(`unexpected evaluator failure\nstdout=${result.stdout}\nstderr=${result.stderr}`);
      }
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(true);
      expect(payload.decision.action).toBe("hold");
      expect(payload.reasons).toEqual([]);
    });
  });

  it("accepts documented stage aliases without changing the decision", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const targetStageOut = path.join(evidenceDir, "rollback-policy-target-stage.json");
      const currentStageOut = path.join(evidenceDir, "rollback-policy-current-stage.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.997,
        p95LatencyMs: 900,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const targetStageResult = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--target-stage",
          "canary",
          "--decision",
          "hold",
          "--window",
          "5m",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          targetStageOut,
        ],
        { timeoutMs: 20_000 },
      );
      expect(targetStageResult.code).toBe(0);

      const currentStageResult = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--current-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          currentStageOut,
        ],
        { timeoutMs: 20_000 },
      );
      expect(currentStageResult.code).toBe(0);

      const targetStagePayload = JSON.parse(await readFile(targetStageOut, "utf8")) as {
        decision: { action: string };
        stage: string;
      };
      const currentStagePayload = JSON.parse(await readFile(currentStageOut, "utf8")) as {
        decision: { action: string };
        stage: string;
      };
      expect(targetStagePayload.stage).toBe("canary");
      expect(currentStagePayload.stage).toBe("canary");
      expect(targetStagePayload.decision.action).toBe("hold");
      expect(currentStagePayload.decision.action).toBe("hold");
    });
  });

  it("supports the documented npm alias with current-stage syntax", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy-npm-alias.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.997,
        p95LatencyMs: 900,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "npm",
          "run",
          "evaluate:auto-rollback",
          "--",
          "--current-stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.stderr).toBe("");
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        decision: { action: string };
        stage: string;
      };
      expect(payload.stage).toBe("canary");
      expect(payload.decision.action).toBe("hold");
    });
  });

  it("triggers rollback on sustained threshold violations", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.93,
        p95LatencyMs: 3200,
        missingTraceRate: 0.02,
        unclassifiedFailures: 1,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "majority",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(payload.reasons.some((reason) => reason.startsWith("success_rate_below_threshold"))).toBe(true);
      expect(payload.reasons.some((reason) => reason.startsWith("p95_latency_above_threshold"))).toBe(true);
    });
  });

  it("triggers rollback when release/cutover/stage readiness fail", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.999,
        p95LatencyMs: 200,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        releasePass: false,
        cutoverPass: false,
        stagePromotionPass: false,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        reasons: string[];
      };
      expect(payload.pass).toBe(false);
      expect(payload.decision.action).toBe("rollback");
      expect(payload.reasons).toContain("release_readiness_failed");
      expect(payload.reasons).toContain("cutover_readiness_failed");
      expect(payload.reasons).toContain("stage_promotion_readiness_failed");
    });
  });

  it("can evaluate only core evidence without requiring stage-promotion readiness", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy-without-stage-promotion.json");
      await seedEvidence(evidenceDir, {
        successRate: 0.997,
        p95LatencyMs: 900,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
      });
      await rm(path.join(evidenceDir, "stage-promotion-readiness-20260426-000000.json"), {
        force: true,
      });
      await seedHorizonStatus(horizonPath);

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--skip-stage-promotion-readiness",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        pass: boolean;
        decision: { action: string };
        checks: { stagePromotionReadinessRequired: boolean };
        reasons: string[];
      };
      expect(result.code).toBe(0);
      expect(payload.pass).toBe(true);
      expect(payload.decision.action).toBe("hold");
      expect(payload.checks.stagePromotionReadinessRequired).toBe(false);
      expect(payload.reasons).toEqual([]);
    });
  });

  it("auto-applies rollback to a supplied env file only when decision is rollback", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy-auto-apply.json");
      const envPath = path.join(dir, "gateway.env");
      await seedEvidence(evidenceDir, {
        successRate: 0.93,
        p95LatencyMs: 3200,
        missingTraceRate: 0.02,
        unclassifiedFailures: 1,
      });
      await seedHorizonStatus(horizonPath);
      await writeFile(
        envPath,
        [
          "UNIFIED_ROUTER_DEFAULT_PRIMARY=hermes",
          "UNIFIED_ROUTER_DEFAULT_FALLBACK=eve",
          "UNIFIED_ROUTER_FAIL_CLOSED=0",
          "UNIFIED_ROUTER_CUTOVER_STAGE=majority",
          "UNIFIED_ROUTER_CANARY_CHAT_IDS=100,200",
          "UNIFIED_ROUTER_MAJORITY_PERCENT=75",
          "",
        ].join("\n"),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "majority",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--auto-apply-rollback",
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(2);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        decision: { action: string; rollbackApplied: boolean };
        rollbackExecution: { pass: boolean } | null;
      };
      expect(payload.decision.action).toBe("rollback");
      expect(payload.decision.rollbackApplied).toBe(true);
      expect(payload.rollbackExecution?.pass).toBe(true);

      const envText = await readFile(envPath, "utf8");
      expect(envText).toContain("UNIFIED_ROUTER_DEFAULT_PRIMARY=eve");
      expect(envText).toContain("UNIFIED_ROUTER_DEFAULT_FALLBACK=none");
      expect(envText).toContain("UNIFIED_ROUTER_FAIL_CLOSED=1");
      expect(envText).toContain("UNIFIED_ROUTER_CUTOVER_STAGE=shadow");
      expect(envText).toContain("UNIFIED_ROUTER_CANARY_CHAT_IDS=");
      expect(envText).toContain("UNIFIED_ROUTER_MAJORITY_PERCENT=0");
    });
  });

  it("does not auto-apply rollback when policy decision is hold", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      const horizonPath = path.join(dir, "HORIZON_STATUS.json");
      const outPath = path.join(evidenceDir, "rollback-policy-hold-auto-apply.json");
      const envPath = path.join(dir, "gateway.env");
      const originalEnv = [
        "UNIFIED_ROUTER_DEFAULT_PRIMARY=eve",
        "UNIFIED_ROUTER_DEFAULT_FALLBACK=hermes",
        "UNIFIED_ROUTER_FAIL_CLOSED=0",
        "UNIFIED_ROUTER_CUTOVER_STAGE=canary",
        "UNIFIED_ROUTER_CANARY_CHAT_IDS=100,200",
        "UNIFIED_ROUTER_MAJORITY_PERCENT=0",
        "",
      ].join("\n");
      await seedEvidence(evidenceDir, {
        successRate: 0.997,
        p95LatencyMs: 900,
        missingTraceRate: 0,
        unclassifiedFailures: 0,
        includeCooldownSignals: false,
      });
      await seedHorizonStatus(horizonPath);
      await writeFile(envPath, originalEnv, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/evaluate-auto-rollback-policy.mjs",
          "--stage",
          "canary",
          "--evidence-dir",
          evidenceDir,
          "--horizon-status-file",
          horizonPath,
          "--env-file",
          envPath,
          "--auto-apply-rollback",
          "--out",
          outPath,
        ],
        { timeoutMs: 20_000 },
      );
      expect(result.code).toBe(0);

      const payload = JSON.parse(await readFile(outPath, "utf8")) as {
        decision: { action: string; rollbackApplied: boolean };
        rollbackExecution: unknown;
      };
      expect(payload.decision.action).toBe("hold");
      expect(payload.decision.rollbackApplied).toBe(false);
      expect(payload.rollbackExecution).toBeNull();
      expect(await readFile(envPath, "utf8")).toBe(originalEnv);
    });
  });
});
