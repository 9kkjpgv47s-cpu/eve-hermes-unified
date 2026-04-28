#!/usr/bin/env node
/**
 * H5 evidence bundle gate (h5-action-9): validates latest evidence from validate:all
 * (validation summary soak dimensions, region drill v2, rollback rehearsal, remediation dry-run).
 * Emits a horizon-closeout schema manifest for optional promote:horizon --closeout-file.
 * Full H5 horizon closeout (required evidence + this bundle) is `npm run validate:h5-closeout`.
 */
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = {
    evidenceDir: "",
    horizonStatusFile: "",
    out: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir" && argv[i + 1]) {
      opts.evidenceDir = argv[i + 1];
      i += 1;
    } else if (a === "--horizon-status-file" && argv[i + 1]) {
      opts.horizonStatusFile = argv[i + 1];
      i += 1;
    } else if (a === "--out" && argv[i + 1]) {
      opts.out = argv[i + 1];
      i += 1;
    }
  }
  return opts;
}

async function newestMatchingFile(dir, predicate) {
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

function countNonNoneKeys(obj) {
  if (!obj || typeof obj !== "object") {
    return 0;
  }
  return Object.keys(obj).filter((k) => k !== "_none").length;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opts.evidenceDir || path.join(ROOT, "evidence"));
  const horizonStatusFile = path.resolve(opts.horizonStatusFile || path.join(ROOT, "docs/HORIZON_STATUS.json"));
  await access(evidenceDir).catch(() => {
    throw new Error(`evidence dir missing: ${evidenceDir}`);
  });

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
      checks.tenantDrillKeyCount = tenantKeys;
      checks.regionDrillKeyCount = regionKeys;
      if (tenantKeys < 2) {
        failures.push(`soak_tenant_drill_diversity_insufficient:${tenantKeys}`);
      }
      if (regionKeys < 2) {
        failures.push(`soak_region_drill_diversity_insufficient:${regionKeys}`);
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

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h5-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H5",
      nextHorizon: null,
      canCloseHorizon: pass,
      canStartNextHorizon: false,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      outPath,
    },
    checks: {
      ...checks,
      horizonCloseoutGatePass: pass,
    },
    failures,
  };

  const schema = validateManifestSchema("horizon-closeout", manifest);
  if (!schema.valid) {
    const schemaFailures = schema.errors.map((e) => `closeout_manifest_schema:${e}`);
    manifest = {
      ...manifest,
      pass: false,
      closeout: { ...manifest.closeout, canCloseHorizon: false },
      checks: { ...manifest.checks, horizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`,
  );
  if (!manifest.pass) {
    process.stderr.write(`H5 evidence bundle validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
