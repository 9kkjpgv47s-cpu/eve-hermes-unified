#!/usr/bin/env node
/**
 * H11 evidence bundle (h11-action-2): scale checks plus newest passing `h11-closeout-*.json`
 * (H10→H11 promotion pin from `validate-h11-closeout.mjs`, not `h11-closeout-evidence-*`).
 * Emits `h11-closeout-evidence-*.json` with `closeout.horizon: "H11"` for `validate-h12-closeout`.
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

  const h11CloseoutPath = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h11-closeout-") && !n.startsWith("h11-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h11CloseoutPath) {
    failures.push("missing_h11_promotion_closeout_manifest");
  }

  let h11Payload = null;
  if (h11CloseoutPath) {
    try {
      h11Payload = JSON.parse(await readFile(h11CloseoutPath, "utf8"));
    } catch (e) {
      failures.push(`h11_closeout_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h11Payload && typeof h11Payload === "object") {
    if (h11Payload.pass !== true) {
      failures.push("h11_closeout_pass_false");
    }
    if (h11Payload.schemaVersion !== "h11-closeout-v1") {
      failures.push(`h11_closeout_schema_version:${String(h11Payload.schemaVersion)}`);
    }
    const c = h11Payload.closeout;
    if (!c || typeof c !== "object") {
      failures.push("h11_closeout_missing_closeout");
    } else {
      if (c.horizon !== "H10" || c.nextHorizon !== "H11") {
        failures.push(`h11_closeout_horizon_mismatch:${String(c.horizon)}->${String(c.nextHorizon)}`);
      }
    }
  }

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h11-closeout-evidence-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H11",
      nextHorizon: null,
      canCloseHorizon: pass,
      canStartNextHorizon: false,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h11PromotionCloseoutPath: h11CloseoutPath,
      outPath,
    },
    checks: {
      ...checks,
      h11PromotionCloseoutPresent: Boolean(h11CloseoutPath),
      h11PromotionCloseoutPass: h11Payload?.pass === true,
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
    process.stderr.write(`H11 evidence bundle validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
