import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "horizon-status-validation-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("validate-horizon-status.mjs", () => {
  it("passes for a valid horizon status file", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      await writeFile(
        statusPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H1",
            activeStatus: "in_progress",
            blockers: [],
            requiredEvidence: [
              {
                id: "evidence-summary",
                command: "npm run validate:evidence-summary",
                artifactPattern: "evidence/validation-summary-*.json",
                required: true,
              },
              {
                id: "cutover-readiness",
                command: "npm run validate:cutover-readiness",
                artifactPattern: "evidence/cutover-readiness-*.json",
                required: true,
              },
              {
                id: "release-readiness",
                command: "npm run validate:release-readiness",
                artifactPattern: "evidence/release-readiness-*.json",
                required: true,
              },
              {
                id: "merge-bundle",
                command: "npm run validate:merge-bundle",
                artifactPattern: "evidence/merge-bundle-validation-*.json",
                required: true,
              },
              {
                id: "bundle-verification",
                command: "npm run verify:merge-bundle",
                artifactPattern: "evidence/bundle-verification-*.json",
                required: true,
              },
            ],
            nextActions: [
              {
                id: "h1-closeout",
                summary: "Stabilize rollout promotion checklist",
                targetHorizon: "H1",
                status: "in_progress",
              },
            ],
            horizonStates: {
              H1: { status: "in_progress", summary: "Operationalization in progress" },
              H2: { status: "planned", summary: "Progressive traffic enablement pending" },
              H3: { status: "planned", summary: "Durability hardening pending" },
              H4: { status: "planned", summary: "Legacy retirement pending" },
              H5: { status: "planned", summary: "Autonomous scale envelope pending" },
            },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H1",
                status: "in_progress",
                note: "Started H1 closeout execution",
              },
            ],
            promotionReadiness: {
              targetStage: "shadow",
              gates: {
                releaseReadinessPass: true,
                mergeBundlePass: true,
                bundleVerificationPass: true,
                cutoverReadinessPass: true,
                evidenceSummaryPass: true,
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-horizon-status.mjs", "--file", statusPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(0);
      const payload = JSON.parse(result.stdout) as { valid: boolean };
      expect(payload.valid).toBe(true);
    });
  });

  it("fails when active horizon and actions are missing", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      await writeFile(
        statusPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "",
            activeStatus: "planned",
            blockers: [],
            requiredEvidence: [],
            nextActions: [],
            horizonStates: {
              H1: { status: "planned", summary: "H1 pending" },
              H2: { status: "planned", summary: "H2 pending" },
              H3: { status: "planned", summary: "H3 pending" },
              H4: { status: "planned", summary: "H4 pending" },
              H5: { status: "planned", summary: "H5 pending" },
            },
            history: [],
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
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-horizon-status.mjs", "--file", statusPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      const errorText = result.stderr.trim();
      expect(errorText).toContain("Horizon status validation failed");
      expect(errorText).toContain("activeHorizon must be one of");
      expect(errorText).toContain("nextActions must contain at least one action");
    });
  });

  it("fails if active status does not match horizon state status", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      await writeFile(
        statusPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H2",
            activeStatus: "in_progress",
            blockers: [],
            requiredEvidence: [
              {
                id: "release-readiness",
                command: "npm run validate:release-readiness",
                artifactPattern: "evidence/release-readiness-*.json",
                required: true,
              },
            ],
            nextActions: [
              {
                id: "h2-kickoff",
                summary: "Kick off progressive cutover controls",
                targetHorizon: "H2",
                status: "planned",
              },
            ],
            horizonStates: {
              H1: { status: "completed", summary: "H1 complete" },
              H2: { status: "planned", summary: "H2 not started" },
              H3: { status: "planned", summary: "H3 pending" },
              H4: { status: "planned", summary: "H4 pending" },
              H5: { status: "planned", summary: "H5 pending" },
            },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H1",
                status: "completed",
                note: "Closed out H1",
              },
            ],
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
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-horizon-status.mjs", "--file", statusPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      const output = result.stderr.trim();
      expect(output).toContain("activeStatus must match horizonStates[activeHorizon].status");
    });
  });

  it("fails when promotion gates require missing evidence commands", async () => {
    await withTempDir(async (dir) => {
      const statusPath = path.join(dir, "HORIZON_STATUS.json");
      await writeFile(
        statusPath,
        JSON.stringify(
          {
            schemaVersion: "v1",
            updatedAtIso: new Date().toISOString(),
            owner: "cloud-agent",
            activeHorizon: "H2",
            activeStatus: "in_progress",
            blockers: [],
            requiredEvidence: [
              {
                id: "cutover",
                command: "npm run validate:cutover-readiness",
                artifactPattern: "evidence/cutover-readiness-*.json",
                required: true,
              },
            ],
            nextActions: [
              {
                id: "h2-promo",
                summary: "Run stage promotion checks",
                targetHorizon: "H2",
                status: "in_progress",
              },
            ],
            horizonStates: {
              H1: { status: "completed", summary: "H1 complete" },
              H2: { status: "in_progress", summary: "H2 active" },
              H3: { status: "planned", summary: "H3 pending" },
              H4: { status: "planned", summary: "H4 pending" },
              H5: { status: "planned", summary: "H5 pending" },
            },
            history: [
              {
                timestamp: new Date().toISOString(),
                horizon: "H2",
                status: "in_progress",
                note: "seed",
              },
            ],
            promotionReadiness: {
              targetStage: "canary",
              gates: {
                releaseReadinessPass: true,
                mergeBundlePass: false,
                bundleVerificationPass: false,
                cutoverReadinessPass: true,
                evidenceSummaryPass: false,
              },
            },
          },
          null,
          2,
        ),
        "utf8",
      );

      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-horizon-status.mjs", "--file", statusPath],
        { timeoutMs: 10_000 },
      );
      expect(result.code).toBe(2);
      const errorText = result.stderr.trim();
      expect(errorText).toContain(
        "promotionReadiness.gates.releaseReadinessPass requires requiredEvidence command: npm run validate:release-readiness",
      );
    });
  });
});
