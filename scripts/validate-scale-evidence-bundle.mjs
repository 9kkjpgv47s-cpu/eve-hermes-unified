/**
 * Shared checks for H5/H6 scale evidence bundles (soak drill dimensions, region drill,
 * partition drill, rollback rehearsal, remediation dry-run). Used by validate-h5-evidence-bundle
 * and validate-h6-evidence-bundle.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function newestMatchingFile(dir, predicate) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((e) => e.isFile() && predicate(e.name)).map((e) => path.join(dir, e.name));
  if (files.length === 0) {
    return null;
  }
  let best = null;
  let bestM = 0;
  for (const f of files) {
    const st = await stat(f);
    const m = st.mtimeMs;
    if (m >= bestM) {
      bestM = m;
      best = f;
    }
  }
  return best;
}

export function countNonNoneKeys(obj) {
  if (!obj || typeof obj !== "object") {
    return 0;
  }
  return Object.keys(obj).filter((k) => k !== "_none").length;
}

/**
 * @param {string} evidenceDir
 * @returns {Promise<{ failures: string[], checks: Record<string, unknown> }>}
 */
export async function runScaleEvidenceBundleChecks(evidenceDir) {
  const failures = [];
  const checks = {};

  const validationPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("validation-summary-") && n.endsWith(".json"),
  );
  if (!validationPath) {
    failures.push("missing_validation_summary");
  } else {
    const vs = JSON.parse(await readFile(validationPath, "utf8"));
    const dd = vs.soakDrillDimensions;
    if (!dd || typeof dd !== "object") {
      failures.push("validation_summary_missing_soakDrillDimensions");
      checks.soakDrillDimensionsPresent = false;
    } else {
      checks.soakDrillDimensionsPresent = true;
      const tenantKeys = countNonNoneKeys(dd.tenants);
      const regionKeys = countNonNoneKeys(dd.regions);
      const partitionKeys = countNonNoneKeys(dd.partitions);
      checks.tenantDrillKeyCount = tenantKeys;
      checks.regionDrillKeyCount = regionKeys;
      checks.partitionDrillKeyCount = partitionKeys;
      if (tenantKeys < 2) {
        failures.push(`soak_tenant_drill_diversity_insufficient:${tenantKeys}`);
      }
      if (regionKeys < 2) {
        failures.push(`soak_region_drill_diversity_insufficient:${regionKeys}`);
      }
      if (partitionKeys < 2) {
        failures.push(`soak_partition_drill_diversity_insufficient:${partitionKeys}`);
      }
    }
    checks.validationSummaryPath = validationPath;
  }

  const regionDrillPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h5-region-misalignment-drill-") && n.endsWith(".json"),
  );
  if (!regionDrillPath) {
    failures.push("missing_h5_region_misalignment_drill_manifest");
    checks.regionDrillPresent = false;
  } else {
    const rd = JSON.parse(await readFile(regionDrillPath, "utf8"));
    checks.regionDrillPresent = true;
    checks.regionDrillPath = regionDrillPath;
    if (rd.schemaVersion !== "h5-region-misalignment-drill-v2") {
      failures.push(`region_drill_schema_version:${String(rd.schemaVersion)}`);
    }
    if (rd.pass !== true) {
      failures.push("region_drill_pass_false");
    }
  }

  const partitionDrillPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h6-partition-drill-") && n.endsWith(".json"),
  );
  if (!partitionDrillPath) {
    failures.push("missing_h6_partition_drill_manifest");
    checks.partitionDrillPresent = false;
  } else {
    const pd = JSON.parse(await readFile(partitionDrillPath, "utf8"));
    checks.partitionDrillPresent = true;
    checks.partitionDrillPath = partitionDrillPath;
    if (pd.schemaVersion !== "h6-partition-drill-v1") {
      failures.push(`partition_drill_schema_version:${String(pd.schemaVersion)}`);
    }
    if (pd.pass !== true) {
      failures.push("partition_drill_pass_false");
    }
  }

  const rollbackPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("emergency-rollback-rehearsal-") && n.endsWith(".json"),
  );
  if (!rollbackPath) {
    failures.push("missing_emergency_rollback_rehearsal_manifest");
    checks.emergencyRollbackRehearsalPresent = false;
  } else {
    const rb = JSON.parse(await readFile(rollbackPath, "utf8"));
    checks.emergencyRollbackRehearsalPresent = true;
    checks.emergencyRollbackRehearsalPath = rollbackPath;
    if (rb.dryRun !== true) {
      failures.push("emergency_rollback_rehearsal_not_dry_run");
    }
  }

  const remediationPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("remediation-playbook-dry-run-") && n.endsWith(".json"),
  );
  if (!remediationPath) {
    failures.push("missing_remediation_playbook_dry_run_manifest");
    checks.remediationDryRunPresent = false;
  } else {
    const rm = JSON.parse(await readFile(remediationPath, "utf8"));
    checks.remediationDryRunPresent = true;
    checks.remediationDryRunPath = remediationPath;
    if (rm.policyBounds?.dryRunOnly !== true) {
      failures.push("remediation_manifest_not_dry_run_only");
    }
  }

  return { failures, checks };
}
