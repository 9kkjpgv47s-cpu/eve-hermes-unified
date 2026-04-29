import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "manifest-schema-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-manifest-schema.mjs", () => {
  it("passes for a valid release-readiness manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "release-readiness.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            defaultValidationCommand: "validate:all",
            pass: true,
            files: {
              validationSummary: path.join(dir, "validation-summary.json"),
              regression: path.join(dir, "regression.json"),
              cutoverReadiness: path.join(dir, "cutover.json"),
              failureInjection: path.join(dir, "failure.txt"),
              soak: path.join(dir, "soak.jsonl"),
              goalPolicyFileValidation: path.join(dir, "goal-policy-file-validation.json"),
              commandLogDir: path.join(dir, "logs"),
              commandsFile: path.join(dir, "commands.json"),
            },
            requiredArtifacts: [],
            releaseCommandLogs: [],
            checks: {
              validationSummaryPassed: true,
              regressionPassed: true,
              cutoverReadinessPassed: true,
              goalPolicyFileValidationPassed: true,
              goalPolicySourceConsistencyReported: true,
              goalPolicySourceConsistencyPass: true,
              commandLogsMissing: [],
              discoveredCommandLogs: [],
              requiredReleaseCommands: [],
              missingRequiredCommands: [],
              executedReleaseCommands: [],
              missingCommandLogFiles: [],
              commandFailures: [],
              validationCommandsPassed: true,
              soakSloRequired: false,
              soakSloPassed: true,
              soakSloPath: null,
              h5BaselineRequired: false,
              h5BaselinePassed: true,
              h5BaselinePath: null,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "release-readiness", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails for invalid merge-bundle manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "merge-bundle.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            bundleVersion: "v1",
            pass: true,
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "merge-bundle", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Manifest schema validation failed");
    });
  });

  it("validates all manifests under evidence directory", async () => {
    await withTempDir(async (dir) => {
      const evidenceDir = path.join(dir, "evidence");
      await mkdir(evidenceDir, { recursive: true });
      const releasePath = path.join(evidenceDir, "release-readiness-1.json");
      const mergeBundlePath = path.join(evidenceDir, "merge-bundle-validation-1.json");

      await writeFile(
        releasePath,
        JSON.stringify(
          {
            readinessVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            defaultValidationCommand: "validate:all",
            pass: true,
            files: {
              validationSummary: null,
              regression: null,
              cutoverReadiness: null,
              failureInjection: null,
              soak: null,
              goalPolicyFileValidation: null,
              commandLogDir: null,
              commandsFile: null,
            },
            requiredArtifacts: [],
            releaseCommandLogs: [],
            checks: {
              validationSummaryPassed: true,
              regressionPassed: true,
              cutoverReadinessPassed: true,
              goalPolicyFileValidationPassed: true,
              goalPolicySourceConsistencyReported: true,
              goalPolicySourceConsistencyPass: true,
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
        mergeBundlePath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            files: {
              validationManifestPath: mergeBundlePath,
              bundleManifestPath: path.join(evidenceDir, "bundle", "merge-readiness-manifest.json"),
              releaseReadinessPath: releasePath,
              initialScopePath: path.join(evidenceDir, "initial-scope-validation-1.json"),
              bundleArchivePath: path.join(evidenceDir, "bundle.tar.gz"),
            },
            checks: {
              buildExitCode: 0,
              bundleManifestPresent: true,
              bundleManifestPass: true,
              bundleFailures: [],
              releaseReadinessGoalPolicyValidationPassed: true,
              initialScopeGoalPolicyValidationPassed: true,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "all", "--evidence-dir", evidenceDir],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);

      const output = result.stdout.trim();
      expect(output.startsWith("{")).toBe(true);
      const payload = JSON.parse(output) as { pass: boolean; validatedCount: number };
      expect(payload.pass).toBe(true);
      expect(payload.validatedCount).toBe(2);
    });
  });

  it("passes for a valid horizon-closeout manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "horizon-closeout-H2-20260426-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            closeout: {
              horizon: "H2",
              nextHorizon: "H3",
              canCloseHorizon: true,
              canStartNextHorizon: false,
            },
            files: {
              evidenceDir: path.join(dir, "evidence"),
              horizonStatusFile: path.join(dir, "HORIZON_STATUS.json"),
              outPath: manifestPath,
            },
            checks: {
              horizonValidationPass: true,
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "horizon-closeout", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails for invalid h2-closeout-run manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "h2-closeout-run-20260426-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            checks: {},
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "h2-closeout-run", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Manifest schema validation failed");
    });
  });

  it("passes for valid horizon-closeout-run manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "horizon-closeout-run-H3-20260426-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            horizon: {
              source: "H3",
              next: "H4",
            },
            files: {
              evidenceDir: path.join(dir, "evidence"),
              horizonStatusFile: path.join(dir, "HORIZON_STATUS.json"),
              envFile: path.join(dir, "gateway.env"),
              outPath: manifestPath,
              calibrationOut: path.join(dir, "rollback-threshold-calibration-majority-20260426.json"),
              simulationOut: path.join(dir, "supervised-rollback-simulation-20260426.json"),
              closeoutOut: path.join(dir, "horizon-closeout-H3-20260426.json"),
            },
            checks: {
              calibrationPass: true,
              supervisedSimulationPass: true,
              horizonCloseoutGatePass: true,
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
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "horizon-closeout-run",
          "--file",
          manifestPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for a valid stage-promotion-readiness manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "stage-promotion-readiness-20260426-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            stage: {
              current: "canary",
              target: "majority",
              transitionAllowed: true,
            },
            checks: {
              releaseReadinessPassed: true,
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
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "stage-promotion-readiness",
          "--file",
          manifestPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails for invalid h2-drill-suite manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "h2-drill-suite-20260426-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            checks: {
              canaryHoldPass: "yes",
            },
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "h2-drill-suite", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("Manifest schema validation failed");
    });
  });

  it("passes for valid unified-dispatch-audit jsonl", async () => {
    await withTempDir(async (dir) => {
      const auditPath = path.join(dir, "unified-dispatch-audit-20260428-000000.jsonl");
      const line = {
        auditSchemaVersion: 1,
        recordedAtIso: new Date().toISOString(),
        traceId: "t-audit",
        chatId: "1",
        messageId: "2",
        routing: {
          primaryLane: "eve",
          fallbackLane: "none",
          reason: "default_policy_lane",
          policyVersion: "v1",
          failClosed: true,
        },
        primaryState: {
          status: "pass",
          reason: "ok",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-audit",
        },
        response: {
          consumed: true,
          responseText: "ok",
          failureClass: "none",
          laneUsed: "eve",
          traceId: "t-audit",
        },
      };
      await writeFile(auditPath, `${JSON.stringify(line)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "unified-dispatch-audit-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for unified-dispatch-audit jsonl schema version 2 with tenantId", async () => {
    await withTempDir(async (dir) => {
      const auditPath = path.join(dir, "unified-dispatch-audit-20260428-v2.jsonl");
      const line = {
        auditSchemaVersion: 2,
        recordedAtIso: new Date().toISOString(),
        traceId: "t-audit-2",
        chatId: "1",
        messageId: "2",
        tenantId: "acme",
        routing: {
          primaryLane: "eve",
          fallbackLane: "none",
          reason: "default_policy_lane",
          policyVersion: "v1",
          failClosed: true,
        },
        primaryState: {
          status: "pass",
          reason: "ok",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-audit-2",
        },
        response: {
          consumed: true,
          responseText: "ok",
          failureClass: "none",
          laneUsed: "eve",
          traceId: "t-audit-2",
        },
      };
      await writeFile(auditPath, `${JSON.stringify(line)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "unified-dispatch-audit-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails when auditSchemaVersion 2 omits tenantId field", async () => {
    await withTempDir(async (dir) => {
      const auditPath = path.join(dir, "unified-dispatch-audit-bad-v2.jsonl");
      const line = {
        auditSchemaVersion: 2,
        recordedAtIso: new Date().toISOString(),
        traceId: "t-bad",
        chatId: "1",
        messageId: "2",
        routing: {
          primaryLane: "eve",
          fallbackLane: "none",
          reason: "default_policy_lane",
          policyVersion: "v1",
          failClosed: true,
        },
        primaryState: {
          status: "pass",
          reason: "ok",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "none",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-bad",
        },
        response: {
          consumed: true,
          responseText: "ok",
          failureClass: "none",
          laneUsed: "eve",
          traceId: "t-bad",
        },
      };
      await writeFile(auditPath, `${JSON.stringify(line)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "unified-dispatch-audit-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("tenantId must be present");
    });
  });

  it("passes for dispatch audit with no-fallback router telemetry on fallbackInfo", async () => {
    await withTempDir(async (dir) => {
      const auditPath = path.join(dir, "unified-dispatch-audit-router-tel.jsonl");
      const line = {
        auditSchemaVersion: 2,
        recordedAtIso: new Date().toISOString(),
        traceId: "t-router-tel",
        chatId: "1",
        messageId: "2",
        tenantId: null,
        routing: {
          primaryLane: "eve",
          fallbackLane: "hermes",
          reason: "default_policy_lane",
          policyVersion: "v1",
          failClosed: false,
        },
        primaryState: {
          status: "failed",
          reason: "blocked",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "policy_failure",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-router-tel",
        },
        fallbackInfo: {
          attempted: false,
          reason: "no_fallback_for_primary_failure_class",
          fromLane: "eve",
          toLane: "hermes",
          primaryFailureClass: "policy_failure",
          noFallbackOnPrimaryFailureClasses: ["policy_failure", "state_unavailable"],
        },
        response: {
          consumed: true,
          responseText: "fail",
          failureClass: "policy_failure",
          laneUsed: "eve",
          traceId: "t-router-tel",
        },
      };
      await writeFile(auditPath, `${JSON.stringify(line)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "unified-dispatch-audit-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("fails dispatch audit validation when fallbackInfo.primaryFailureClass is invalid", async () => {
    await withTempDir(async (dir) => {
      const auditPath = path.join(dir, "unified-dispatch-audit-bad-fallback.jsonl");
      const line = {
        auditSchemaVersion: 2,
        recordedAtIso: new Date().toISOString(),
        traceId: "t-bad-fb",
        chatId: "1",
        messageId: "2",
        tenantId: null,
        routing: {
          primaryLane: "eve",
          fallbackLane: "hermes",
          reason: "default_policy_lane",
          policyVersion: "v1",
          failClosed: false,
        },
        primaryState: {
          status: "failed",
          reason: "blocked",
          runtimeUsed: "eve",
          runId: "r1",
          elapsedMs: 1,
          failureClass: "policy_failure",
          sourceLane: "eve",
          sourceChatId: "1",
          sourceMessageId: "2",
          traceId: "t-bad-fb",
        },
        fallbackInfo: {
          attempted: false,
          reason: "no_fallback_for_primary_failure_class",
          fromLane: "eve",
          toLane: "hermes",
          primaryFailureClass: "not_a_class",
          noFallbackOnPrimaryFailureClasses: ["policy_failure"],
        },
        response: {
          consumed: true,
          responseText: "fail",
          failureClass: "policy_failure",
          laneUsed: "eve",
          traceId: "t-bad-fb",
        },
      };
      await writeFile(auditPath, `${JSON.stringify(line)}\n`, "utf8");

      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "unified-dispatch-audit-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stderr).toContain("primaryFailureClass invalid");
    });
  });

  it("passes for valid capability-policy-audit jsonl", async () => {
    await withTempDir(async (dir) => {
      const fp = "a".repeat(64);
      const auditPath = path.join(dir, "capability-policy-audit-20260428-000000.jsonl");
      const lines = [
        {
          auditSchemaVersion: 1,
          eventType: "policy_config_loaded",
          recordedAtIso: new Date().toISOString(),
          policyFingerprintSha256: fp,
        },
        {
          auditSchemaVersion: 1,
          eventType: "policy_denial",
          recordedAtIso: new Date().toISOString(),
          traceId: "t-pol",
          chatId: "1",
          messageId: "2",
          capabilityId: "status",
          lane: "eve",
          policyReason: "capability_policy_denied",
          policyFingerprintSha256: fp,
          tenantId: null,
        },
      ];
      await writeFile(
        auditPath,
        lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
        "utf8",
      );
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "capability-policy-audit-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for valid router-telemetry jsonl", async () => {
    await withTempDir(async (dir) => {
      const auditPath = path.join(dir, "router-telemetry-20260428-000000.jsonl");
      const line = {
        auditSchemaVersion: 1,
        eventType: "router_no_fallback_skipped",
        recordedAtIso: new Date().toISOString(),
        traceId: "t-rt",
        chatId: "1",
        messageId: "2",
        tenantId: null,
        policyVersion: "v1",
        routingReason: "default_policy_lane",
        primaryLane: "eve",
        skippedFallbackLane: "hermes",
        primaryFailureClass: "policy_failure",
        noFallbackOnPrimaryFailureClasses: ["policy_failure"],
        primaryRunId: "r1",
        primaryReason: "blocked",
      };
      await writeFile(auditPath, `${JSON.stringify(line)}\n`, "utf8");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "router-telemetry-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for valid dispatch-queue-journal jsonl", async () => {
    await withTempDir(async (dir) => {
      const auditPath = path.join(dir, "dispatch-queue-journal-20260428-000000.jsonl");
      const routing = {
        primaryLane: "eve",
        fallbackLane: "hermes",
        reason: "default_policy_lane",
        policyVersion: "v1",
        failClosed: false,
      };
      const lines = [
        {
          auditSchemaVersion: 1,
          eventType: "dispatch_queue_accepted",
          recordedAtIso: new Date().toISOString(),
          traceId: "t-q",
          chatId: "1",
          messageId: "2",
          tenantId: null,
          dispatchPath: "lane",
          routing,
        },
        {
          auditSchemaVersion: 1,
          eventType: "dispatch_queue_finished",
          recordedAtIso: new Date().toISOString(),
          traceId: "t-q",
          chatId: "1",
          messageId: "2",
          tenantId: null,
          responseLaneUsed: "eve",
          responseFailureClass: "none",
          primaryLane: "eve",
          primaryStatus: "pass",
          fallbackAttempted: false,
          capabilityConsumed: false,
        },
      ];
      await writeFile(
        auditPath,
        lines.map((l) => JSON.stringify(l)).join("\n") + "\n",
        "utf8",
      );
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "dispatch-queue-journal-jsonl",
          "--file",
          auditPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for valid emergency-rollback-bundle manifest", async () => {
    await withTempDir(async (dir) => {
      const bundlePath = path.join(dir, "emergency-rollback-bundle-20260428-000000.json");
      await writeFile(
        bundlePath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            horizon: "H3",
            summary: "Test bundle",
            pass: true,
            files: {
              validationSummary: path.join(dir, "vs.json"),
              soak: path.join(dir, "soak.jsonl"),
              failureInjection: path.join(dir, "fi.txt"),
              cutoverReadiness: path.join(dir, "co.json"),
              regressionEvePrimary: path.join(dir, "re.json"),
            },
            steps: [
              {
                id: "step-1",
                title: "Validate",
                command: "npm run validate:all",
                evidencePaths: [path.join(dir, "vs.json")],
              },
            ],
          },
          null,
          2,
        ),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "emergency-rollback-bundle",
          "--file",
          bundlePath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for valid h4-closeout-evidence manifest", async () => {
    await withTempDir(async (dir) => {
      const memPath = path.join(dir, "memory-audit-report.json");
      await writeFile(
        memPath,
        JSON.stringify(
          {
            schemaVersion: 1,
            generatedAtIso: new Date().toISOString(),
            pass: true,
            checks: { crossLaneInvariantPass: true, walReplayInvariantPass: true },
          },
          null,
          2,
        ),
        "utf8",
      );
      const manifestPath = path.join(dir, "h4-closeout-evidence-20260429-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            horizon: "H4",
            summary: "fixture",
            pass: true,
            commands: {
              dispatchFixtureTests: {
                command: "npx vitest run test/dispatch-conformance-fixtures.test.ts",
                exitCode: 0,
                pass: true,
              },
              memoryAuditReport: {
                command: "npx tsx src/bin/memory-audit-report.ts",
                exitCode: 0,
                pass: true,
              },
            },
            artifacts: {
              memoryAuditReportPath: memPath,
              memoryAuditReport: JSON.parse(await readFile(memPath, "utf8")),
              emergencyRollbackBundlePath: null,
            },
            checks: {
              dispatchFixtureConformancePass: true,
              memoryAuditReportPass: true,
              emergencyRollbackBundleSchemaPass: null,
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "h4-closeout-evidence", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for valid h5-evidence-baseline manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "h5-evidence-baseline-20260429-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            horizon: "H5",
            summary: "fixture",
            pass: true,
            thresholds: { maxSoakLines: 50000, maxP95LatencyMs: 10000 },
            files: {
              soakPath: path.join(dir, "soak.jsonl"),
              soakSloReportPath: path.join(dir, "slo.json"),
              validationSummaryPath: path.join(dir, "vs.json"),
              failureInjectionPath: path.join(dir, "fi.txt"),
              cutoverReadinessPath: path.join(dir, "co.json"),
              regressionEvePrimaryPath: path.join(dir, "re.json"),
              emergencyRollbackBundlePath: null,
              h4CloseoutEvidencePath: null,
              evidencePruneDryRunPath: null,
            },
            commands: {
              soakSlo: { command: "node scripts/validate-soak-slo.mjs", exitCode: 0, pass: true },
              evidencePruneDryRun: { command: "node scripts/prune-evidence.mjs", exitCode: 0, pass: true },
            },
            checks: {
              coreArtifactPathsPresent: true,
              soakSloPass: true,
              validationSummaryGatePass: true,
              evidenceLineBudgetPass: true,
              soakLineCount: 1,
              p95LatencyMs: 5,
              p95BudgetPass: true,
              emergencyRollbackBundleSchemaPass: null,
              h4CloseoutEvidencePass: null,
              evidencePruneDryRunPass: true,
            },
          },
          null,
          2,
        ),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "h5-evidence-baseline", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for valid evidence-prune-run manifest", async () => {
    await withTempDir(async (dir) => {
      const manifestPath = path.join(dir, "evidence-prune-run-20260430-000000.json");
      await writeFile(
        manifestPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            generatedAtIso: new Date().toISOString(),
            evidenceDir: dir,
            ttlDays: 30,
            dryRun: true,
            pass: true,
            prefixCount: 5,
            examined: 2,
            eligible: 1,
            deleted: 0,
            skipped: 1,
            errors: [],
            deletedPaths: [path.join(dir, "soak-old.jsonl")],
          },
          null,
          2,
        ),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "evidence-prune-run", "--file", manifestPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
    });
  });

  it("passes for valid stage-drill and auto-rollback-policy manifests", async () => {
    await withTempDir(async (dir) => {
      const stageDrillPath = path.join(dir, "stage-drill-canary-20260426-000000.json");
      const rollbackPath = path.join(dir, "auto-rollback-policy-20260426-000000.json");
      await writeFile(
        stageDrillPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            stage: "canary",
            decision: {
              action: "hold",
            },
            checks: {},
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );
      await writeFile(
        rollbackPath,
        JSON.stringify(
          {
            generatedAtIso: new Date().toISOString(),
            pass: true,
            stage: "canary",
            decision: {
              action: "hold",
            },
            checks: {},
            reasons: [],
            triggers: [],
            failures: [],
          },
          null,
          2,
        ),
        "utf8",
      );

      const stageResult = await runCommandWithTimeout(
        ["node", "scripts/validate-manifest-schema.mjs", "--type", "stage-drill", "--file", stageDrillPath],
        { timeoutMs: 10_000 },
      );
      const rollbackResult = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-manifest-schema.mjs",
          "--type",
          "auto-rollback-policy",
          "--file",
          rollbackPath,
        ],
        { timeoutMs: 10_000 },
      );
      expect(stageResult.code).toBe(0);
      expect(rollbackResult.code).toBe(0);
    });
  });
});
