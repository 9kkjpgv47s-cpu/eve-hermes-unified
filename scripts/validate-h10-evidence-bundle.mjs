#!/usr/bin/env node
/**
 * H10 evidence bundle (h10-action-2): scale checks plus newest passing `h10-closeout-*.json`
 * (H9→H10 promotion pin from `validate-h10-closeout.mjs`, not `h10-closeout-evidence-*`).
 * Emits `h10-closeout-evidence-*.json` with `closeout.horizon: "H10"` for `validate-h11-closeout`.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";
import { newestMatchingFile, runScaleEvidenceBundleChecks } from "./validate-scale-evidence-bundle.mjs";

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

  const h10CloseoutPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h10-closeout-") && !n.startsWith("h10-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h10CloseoutPath) {
    failures.push("missing_h10_promotion_closeout_manifest");
  }

  let h10Payload = null;
  if (h10CloseoutPath) {
    try {
      h10Payload = JSON.parse(await readFile(h10CloseoutPath, "utf8"));
    } catch (e) {
      failures.push(`h10_closeout_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h10Payload && typeof h10Payload === "object") {
    if (h10Payload.pass !== true) {
      failures.push("h10_closeout_pass_false");
    }
    if (h10Payload.schemaVersion !== "h10-closeout-v1") {
      failures.push(`h10_closeout_schema_version:${String(h10Payload.schemaVersion)}`);
    }
    const c = h10Payload.closeout;
    if (!c || typeof c !== "object") {
      failures.push("h10_closeout_missing_closeout");
    } else {
      if (c.horizon !== "H9" || c.nextHorizon !== "H10") {
        failures.push(`h10_closeout_horizon_mismatch:${String(c.horizon)}->${String(c.nextHorizon)}`);
      }
    }
  }

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h10-closeout-evidence-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H10",
      nextHorizon: null,
      canCloseHorizon: pass,
      canStartNextHorizon: false,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h10PromotionCloseoutPath: h10CloseoutPath,
      outPath,
    },
    checks: {
      ...checks,
      h10PromotionCloseoutPresent: Boolean(h10CloseoutPath),
      h10PromotionCloseoutPass: h10Payload?.pass === true,
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
    process.stderr.write(`H10 evidence bundle validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
