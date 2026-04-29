import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

async function withTempEvidenceDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h5-scripts-test-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe("H5 operator scripts", () => {
  it("h6-partition-drill passes and writes manifest", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const result = await runCommandWithTimeout(
        ["node", "scripts/h6-partition-drill.mjs", "--evidence-dir", evidenceDir],
        { timeoutMs: 60_000, env: { ...process.env } as Record<string, string> },
      );
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout.trim()) as {
        pass?: boolean;
        manifestPath?: string;
        schemaVersion?: string;
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.manifestPath).toContain("h6-partition-drill-");
      expect(parsed.schemaVersion).toBe("h6-partition-drill-v1");
    });
  });

  it("h5-region-misalignment-drill passes and writes manifest", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const result = await runCommandWithTimeout(
        ["node", "scripts/h5-region-misalignment-drill.mjs", "--evidence-dir", evidenceDir],
        { timeoutMs: 60_000, env: { ...process.env } as Record<string, string> },
      );
      expect(result.code).toBe(0);
      const parsed = JSON.parse(result.stdout.trim()) as {
        pass?: boolean;
        manifestPath?: string;
        schemaVersion?: string;
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.manifestPath).toContain("h5-region-misalignment-drill-");
      expect(parsed.schemaVersion).toBe("h5-region-misalignment-drill-v2");
    });
  });

  it("validate-h5-evidence-bundle fails when soak drill dimensions are missing", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const summaryPath = path.join(evidenceDir, "validation-summary-test.json");
      await writeFile(
        summaryPath,
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          metrics: { totalRecords: 1 },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h5-closeout-out.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-h5-evidence-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.pass).toBe(false);
      expect(parsed.failures?.some((f) => f.includes("validation_summary_missing_soakDrillDimensions"))).toBe(
        true,
      );
    });
  });

  it("validate-h5-evidence-bundle passes with synthetic H5 evidence bundle", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990101-000000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          soakDrillDimensions: {
            tenants: { alpha: 5, beta: 5, _none: 2 },
            regions: { "us-west": 5, "eu-central": 5, _none: 2 },
            partitions: { "soak-part-a": 5, "soak-part-b": 5, _none: 2 },
            regionAligned: { true: 10, false: 0, unknown: 0 },
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h5-region-misalignment-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-region-misalignment-drill-v2",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h6-partition-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h6-partition-drill-v1",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `emergency-rollback-rehearsal-${stamp}.json`),
        JSON.stringify({
          manifestVersion: "h3-emergency-rollback-rehearsal-v1",
          dryRun: true,
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `remediation-playbook-dry-run-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-remediation-dry-run-v1",
          policyBounds: { dryRunOnly: true },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h5-closeout-pass.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-h5-evidence-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; checks?: { horizonCloseoutGatePass?: boolean } };
      expect(parsed.pass).toBe(true);
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
    });
  });

  it("validate-h5-evidence-bundle fails when partition drill diversity is insufficient", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990102-000000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          soakDrillDimensions: {
            tenants: { alpha: 5, beta: 5, _none: 2 },
            regions: { "us-west": 5, "eu-central": 5, _none: 2 },
            partitions: { "only-one": 10, _none: 2 },
            regionAligned: { true: 10, false: 0, unknown: 0 },
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h5-region-misalignment-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-region-misalignment-drill-v2",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h6-partition-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h6-partition-drill-v1",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `emergency-rollback-rehearsal-${stamp}.json`),
        JSON.stringify({ manifestVersion: "h3-emergency-rollback-rehearsal-v1", dryRun: true }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `remediation-playbook-dry-run-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-remediation-dry-run-v1",
          policyBounds: { dryRunOnly: true },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h5-closeout-partition-fail.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-h5-evidence-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.pass).toBe(false);
      expect(parsed.failures?.some((f) => f.includes("soak_partition_drill_diversity_insufficient"))).toBe(true);
    });
  });

  it("validate-h5-evidence-bundle fails when h6 partition drill manifest is missing", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990103-000000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          soakDrillDimensions: {
            tenants: { alpha: 5, beta: 5, _none: 2 },
            regions: { "us-west": 5, "eu-central": 5, _none: 2 },
            partitions: { "soak-part-a": 5, "soak-part-b": 5, _none: 2 },
            regionAligned: { true: 10, false: 0, unknown: 0 },
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h5-region-misalignment-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-region-misalignment-drill-v2",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `emergency-rollback-rehearsal-${stamp}.json`),
        JSON.stringify({ manifestVersion: "h3-emergency-rollback-rehearsal-v1", dryRun: true }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `remediation-playbook-dry-run-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-remediation-dry-run-v1",
          policyBounds: { dryRunOnly: true },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h5-closeout-missing-h6.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-h5-evidence-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.pass).toBe(false);
      expect(parsed.failures?.some((f) => f.includes("missing_h6_partition_drill_manifest"))).toBe(true);
    });
  });

  it("validate-h6-closeout fails when no h5-closeout manifest exists", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const outPath = path.join(evidenceDir, "h6-closeout-fail.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h6-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.pass).toBe(false);
      expect(parsed.failures?.some((f) => f.includes("missing_h5_evidence_closeout_manifest"))).toBe(true);
    });
  });

  it("validate-h6-closeout passes when latest h5-closeout bundle passed", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990104-000000";
      await writeFile(
        path.join(evidenceDir, `h5-closeout-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          pass: true,
          closeout: { horizon: "H5", nextHorizon: null, canCloseHorizon: true, canStartNextHorizon: false },
          checks: { horizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h6-closeout-pass.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h6-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        pass?: boolean;
        schemaVersion?: string;
        closeout?: { horizon?: string; nextHorizon?: string };
        checks?: { h6HorizonCloseoutGatePass?: boolean; horizonCloseoutGatePass?: boolean };
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.schemaVersion).toBe("h6-closeout-v1");
      expect(parsed.closeout?.horizon).toBe("H5");
      expect(parsed.closeout?.nextHorizon).toBe("H6");
      expect(parsed.checks?.h6HorizonCloseoutGatePass).toBe(true);
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
    });
  });

  it("validate-h6-evidence-bundle passes with synthetic scale evidence", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990105-000000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          soakDrillDimensions: {
            tenants: { alpha: 5, beta: 5, _none: 2 },
            regions: { "us-west": 5, "eu-central": 5, _none: 2 },
            partitions: { "soak-part-a": 5, "soak-part-b": 5, _none: 2 },
            regionAligned: { true: 10, false: 0, unknown: 0 },
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h5-region-misalignment-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-region-misalignment-drill-v2",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h6-partition-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h6-partition-drill-v1",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `emergency-rollback-rehearsal-${stamp}.json`),
        JSON.stringify({
          manifestVersion: "h3-emergency-rollback-rehearsal-v1",
          dryRun: true,
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `remediation-playbook-dry-run-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-remediation-dry-run-v1",
          policyBounds: { dryRunOnly: true },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h6-closeout-evidence-pass.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-h6-evidence-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        pass?: boolean;
        closeout?: { horizon?: string };
        checks?: { horizonCloseoutGatePass?: boolean };
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.closeout?.horizon).toBe("H6");
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
    });
  });

  it("validate-h7-closeout fails when no h6-closeout-evidence manifest exists", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const outPath = path.join(evidenceDir, "h7-closeout-fail.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h7-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.pass).toBe(false);
      expect(parsed.failures?.some((f) => f.includes("missing_h6_evidence_closeout_manifest"))).toBe(true);
    });
  });

  it("validate-h7-closeout passes when latest h6-closeout-evidence bundle passed", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990106-000000";
      await writeFile(
        path.join(evidenceDir, `h6-closeout-evidence-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          pass: true,
          closeout: { horizon: "H6", nextHorizon: null, canCloseHorizon: true, canStartNextHorizon: false },
          checks: { horizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h7-closeout-pass.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h7-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        pass?: boolean;
        schemaVersion?: string;
        closeout?: { horizon?: string; nextHorizon?: string };
        checks?: { h7HorizonCloseoutGatePass?: boolean; horizonCloseoutGatePass?: boolean };
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.schemaVersion).toBe("h7-closeout-v1");
      expect(parsed.closeout?.horizon).toBe("H6");
      expect(parsed.closeout?.nextHorizon).toBe("H7");
      expect(parsed.checks?.h7HorizonCloseoutGatePass).toBe(true);
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
    });
  });

  it("validate-h7-evidence-bundle passes with synthetic scale evidence", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990107-000000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          soakDrillDimensions: {
            tenants: { alpha: 5, beta: 5, _none: 2 },
            regions: { "us-west": 5, "eu-central": 5, _none: 2 },
            partitions: { "soak-part-a": 5, "soak-part-b": 5, _none: 2 },
            regionAligned: { true: 10, false: 0, unknown: 0 },
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h5-region-misalignment-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-region-misalignment-drill-v2",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h6-partition-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h6-partition-drill-v1",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `emergency-rollback-rehearsal-${stamp}.json`),
        JSON.stringify({
          manifestVersion: "h3-emergency-rollback-rehearsal-v1",
          dryRun: true,
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `remediation-playbook-dry-run-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-remediation-dry-run-v1",
          policyBounds: { dryRunOnly: true },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h7-closeout-evidence-pass.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-h7-evidence-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        pass?: boolean;
        closeout?: { horizon?: string };
        checks?: { horizonCloseoutGatePass?: boolean };
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.closeout?.horizon).toBe("H7");
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
    });
  });

  it("validate-h8-closeout fails when no h7-closeout-evidence manifest exists", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const outPath = path.join(evidenceDir, "h8-closeout-fail.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h8-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.pass).toBe(false);
      expect(parsed.failures?.some((f) => f.includes("missing_h7_evidence_closeout_manifest"))).toBe(true);
    });
  });

  it("validate-h8-closeout fails when no h7-closeout-evidence manifest exists", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const outPath = path.join(evidenceDir, "h8-closeout-fail.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h8-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.pass).toBe(false);
      expect(parsed.failures?.some((f) => f.includes("missing_h7_evidence_closeout_manifest"))).toBe(true);
    });
  });

  it("validate-h8-closeout fails when validation-summary lacks sloPosture", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990108-100000";
      await writeFile(
        path.join(evidenceDir, `h7-closeout-evidence-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          pass: true,
          closeout: { horizon: "H7", nextHorizon: null, canCloseHorizon: true, canStartNextHorizon: false },
          checks: { horizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({ generatedAtIso: new Date().toISOString(), metrics: { totalRecords: 1 } }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h8-closeout-no-slo.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h8-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.failures?.some((f) => f.includes("validation_summary_missing_sloPosture"))).toBe(true);
    });
  });

  it("validate-h8-closeout passes when latest h7-closeout-evidence bundle passed", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990108-000000";
      await writeFile(
        path.join(evidenceDir, `h7-closeout-evidence-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          pass: true,
          closeout: { horizon: "H7", nextHorizon: null, canCloseHorizon: true, canStartNextHorizon: false },
          checks: { horizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          metrics: { totalRecords: 1 },
          sloPosture: {
            schemaVersion: "h8-slo-posture-v1",
            generatedAtIso: new Date().toISOString(),
            horizonProgram: "H8",
            metrics: { successRate: 1, missingTraceRate: 0 },
            evidenceGates: { minSuccessRate: 0.99 },
            gatesPassed: true,
          },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h8-closeout-pass.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h8-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        pass?: boolean;
        schemaVersion?: string;
        closeout?: { horizon?: string; nextHorizon?: string };
        checks?: {
          h8HorizonCloseoutGatePass?: boolean;
          horizonCloseoutGatePass?: boolean;
          sloPostureGatesPassed?: boolean;
        };
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.schemaVersion).toBe("h8-closeout-v1");
      expect(parsed.closeout?.horizon).toBe("H7");
      expect(parsed.closeout?.nextHorizon).toBe("H8");
      expect(parsed.checks?.h8HorizonCloseoutGatePass).toBe(true);
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
      expect(parsed.checks?.sloPostureGatesPassed).toBe(true);
    });
  });

  it("validate-h8-evidence-bundle passes with synthetic scale evidence", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990109-000000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          soakDrillDimensions: {
            tenants: { alpha: 5, beta: 5, _none: 2 },
            regions: { "us-west": 5, "eu-central": 5, _none: 2 },
            partitions: { "soak-part-a": 5, "soak-part-b": 5, _none: 2 },
            regionAligned: { true: 10, false: 0, unknown: 0 },
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h5-region-misalignment-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-region-misalignment-drill-v2",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h6-partition-drill-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h6-partition-drill-v1",
          pass: true,
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `emergency-rollback-rehearsal-${stamp}.json`),
        JSON.stringify({
          manifestVersion: "h3-emergency-rollback-rehearsal-v1",
          dryRun: true,
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `remediation-playbook-dry-run-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h5-remediation-dry-run-v1",
          policyBounds: { dryRunOnly: true },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h8-closeout-evidence-pass.json");
      const result = await runCommandWithTimeout(
        [
          "node",
          "scripts/validate-h8-evidence-bundle.mjs",
          "--evidence-dir",
          evidenceDir,
          "--out",
          outPath,
        ],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        pass?: boolean;
        closeout?: { horizon?: string };
        checks?: { horizonCloseoutGatePass?: boolean };
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.closeout?.horizon).toBe("H8");
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
    });
  });

  it("validate-h9-closeout fails when no h8-closeout-evidence manifest exists", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const outPath = path.join(evidenceDir, "h9-closeout-fail.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h9-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.failures?.some((f) => f.includes("missing_h8_evidence_closeout_manifest"))).toBe(true);
    });
  });

  it("validate-h9-closeout fails when validation-summary lacks sloPosture", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990109-100000";
      await writeFile(
        path.join(evidenceDir, `h8-closeout-evidence-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          pass: true,
          closeout: { horizon: "H8", nextHorizon: null, canCloseHorizon: true, canStartNextHorizon: false },
          checks: { horizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({ generatedAtIso: new Date().toISOString(), metrics: { totalRecords: 1 } }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h9-closeout-no-slo.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h9-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as { pass?: boolean; failures?: string[] };
      expect(parsed.failures?.some((f) => f.includes("validation_summary_missing_sloPosture"))).toBe(true);
    });
  });

  it("validate-h9-closeout passes when latest h8-closeout-evidence and sloPosture passed", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990109-200000";
      await writeFile(
        path.join(evidenceDir, `h8-closeout-evidence-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          pass: true,
          closeout: { horizon: "H8", nextHorizon: null, canCloseHorizon: true, canStartNextHorizon: false },
          checks: { horizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          metrics: { totalRecords: 1 },
          sloPosture: {
            schemaVersion: "h8-slo-posture-v1",
            generatedAtIso: new Date().toISOString(),
            horizonProgram: "H8",
            metrics: { successRate: 1, missingTraceRate: 0 },
            evidenceGates: { minSuccessRate: 0.99 },
            gatesPassed: true,
          },
        }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "h9-closeout-pass.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/validate-h9-closeout.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        pass?: boolean;
        schemaVersion?: string;
        closeout?: { horizon?: string; nextHorizon?: string };
        checks?: {
          h9HorizonCloseoutGatePass?: boolean;
          horizonCloseoutGatePass?: boolean;
          sloPostureGatesPassed?: boolean;
        };
      };
      expect(parsed.pass).toBe(true);
      expect(parsed.schemaVersion).toBe("h9-closeout-v1");
      expect(parsed.closeout?.horizon).toBe("H8");
      expect(parsed.closeout?.nextHorizon).toBe("H9");
      expect(parsed.checks?.h9HorizonCloseoutGatePass).toBe(true);
      expect(parsed.checks?.horizonCloseoutGatePass).toBe(true);
      expect(parsed.checks?.sloPostureGatesPassed).toBe(true);
    });
  });

  it("emit-validate-all-chain-posture fails when h9-closeout manifest is missing", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990109-310000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          sloPosture: {
            schemaVersion: "h8-slo-posture-v1",
            generatedAtIso: new Date().toISOString(),
            gatesPassed: true,
            metrics: { successRate: 1, missingTraceRate: 0 },
            evidenceGates: {},
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `regression-eve-primary-${stamp}.json`),
        JSON.stringify({ pass: true }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
        JSON.stringify({ pass: true }),
        "utf8",
      );
      const result = await runCommandWithTimeout(
        ["node", "scripts/emit-validate-all-chain-posture.mjs", "--evidence-dir", evidenceDir],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(2);
      expect(result.stdout).toContain('"pass":false');
    });
  });

  it("emit-validate-all-chain-posture passes when all tail artifacts pass", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const stamp = "20990109-320000";
      await writeFile(
        path.join(evidenceDir, `validation-summary-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          sloPosture: {
            schemaVersion: "h8-slo-posture-v1",
            generatedAtIso: new Date().toISOString(),
            gatesPassed: true,
            metrics: { successRate: 1, missingTraceRate: 0 },
            evidenceGates: {},
          },
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h8-closeout-evidence-${stamp}.json`),
        JSON.stringify({
          generatedAtIso: new Date().toISOString(),
          pass: true,
          closeout: { horizon: "H8", nextHorizon: null, canCloseHorizon: true, canStartNextHorizon: false },
          checks: { horizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `h9-closeout-${stamp}.json`),
        JSON.stringify({
          schemaVersion: "h9-closeout-v1",
          pass: true,
          closeout: { horizon: "H8", nextHorizon: "H9" },
          checks: { h9HorizonCloseoutGatePass: true },
          failures: [],
        }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `regression-eve-primary-${stamp}.json`),
        JSON.stringify({ pass: true, iterations: 1 }),
        "utf8",
      );
      await writeFile(
        path.join(evidenceDir, `cutover-readiness-${stamp}.json`),
        JSON.stringify({ pass: true, stagePass: true }),
        "utf8",
      );
      const outPath = path.join(evidenceDir, "chain-posture-pass.json");
      const result = await runCommandWithTimeout(
        ["node", "scripts/emit-validate-all-chain-posture.mjs", "--evidence-dir", evidenceDir, "--out", outPath],
        { timeoutMs: 15_000 },
      );
      expect(result.code).toBe(0);
      const raw = await readFile(outPath, "utf8");
      const parsed = JSON.parse(raw) as {
        schemaVersion?: string;
        gatesPassed?: boolean;
        horizonProgram?: string;
        checks?: { validationSummarySloPostureGatesPassed?: boolean };
      };
      expect(parsed.schemaVersion).toBe("h9-validate-all-chain-v1");
      expect(parsed.horizonProgram).toBe("H9");
      expect(parsed.gatesPassed).toBe(true);
      expect(parsed.checks?.validationSummarySloPostureGatesPassed).toBe(true);
    });
  });

  it("validate-h5-tenant-isolation emits valid JSON", async () => {
    const result = await runCommandWithTimeout(["node", "scripts/validate-h5-tenant-isolation.mjs"], {
      timeoutMs: 10_000,
    });
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout.trim()) as { valid?: boolean };
    expect(parsed.valid).toBe(true);
  });

  it("remediation-playbook-dry-run writes a JSON manifest under EVIDENCE_DIR", async () => {
    await withTempEvidenceDir(async (evidenceDir) => {
      const result = await runCommandWithTimeout(["bash", "scripts/remediation-playbook-dry-run.sh"], {
        timeoutMs: 15_000,
        env: { ...process.env, EVIDENCE_DIR: evidenceDir } as Record<string, string>,
      });
      expect(result.code).toBe(0);
      const files = await readdir(evidenceDir);
      const manifest = files.find((f) => f.startsWith("remediation-playbook-dry-run-") && f.endsWith(".json"));
      expect(manifest).toBeDefined();
      const raw = await readFile(path.join(evidenceDir, manifest!), "utf8");
      const parsed = JSON.parse(raw) as { schemaVersion?: string; policyBounds?: { dryRunOnly?: boolean } };
      expect(parsed.schemaVersion).toContain("h5-remediation");
      expect(parsed.policyBounds?.dryRunOnly).toBe(true);
    });
  });
});
