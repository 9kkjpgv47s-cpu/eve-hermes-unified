#!/usr/bin/env node
/**
 * H6 evidence bundle gate (h7-action-2): same machine checks as validate-h5-evidence-bundle
 * (soak tenant/region/partition dimensions, region drill, partition drill, rollback, remediation).
 * Emits `h6-closeout-evidence-*.json` (horizon-closeout schema) so `validate-h7-closeout` can wrap
 * the latest passing manifest for promote:horizon H6→H7 with `--goal-policy-key H6->H7`.
 */
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";
import { runScaleEvidenceBundleChecks } from "./validate-scale-evidence-bundle.mjs";

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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opts.evidenceDir || path.join(ROOT, "evidence"));
  const horizonStatusFile = path.resolve(opts.horizonStatusFile || path.join(ROOT, "docs/HORIZON_STATUS.json"));
  await access(evidenceDir).catch(() => {
    throw new Error(`evidence dir missing: ${evidenceDir}`);
  });

  const { failures, checks } = await runScaleEvidenceBundleChecks(evidenceDir);
  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h6-closeout-evidence-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H6",
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
    process.stderr.write(`H6 evidence bundle validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
