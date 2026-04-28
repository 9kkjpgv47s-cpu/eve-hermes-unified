#!/usr/bin/env node
/**
 * H6 closeout gate (h6-action-4): wraps the latest H5 evidence-bundle manifest
 * (`h5-closeout-*.json` from `npm run validate:h5-evidence-bundle`) and emits
 * `h6-closeout-*.json` for operators pinning `promote:horizon` H5→H6 with
 * `--closeout-file` alongside `H5->H6` goal policy checks in docs/GOAL_POLICIES.json.
 */
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const opts = { evidenceDir: "", horizonStatusFile: "", out: "" };
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
    if (st.mtimeMs >= bestM) {
      bestM = st.mtimeMs;
      best = f;
    }
  }
  return best;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opts.evidenceDir || path.join(ROOT, "evidence"));
  const horizonStatusFile = path.resolve(opts.horizonStatusFile || path.join(ROOT, "docs/HORIZON_STATUS.json"));
  await access(evidenceDir).catch(() => {
    throw new Error(`evidence dir missing: ${evidenceDir}`);
  });

  const failures = [];
  const h5Path = await newestMatchingFile(evidenceDir, (n) => n.startsWith("h5-closeout-") && n.endsWith(".json"));
  if (!h5Path) {
    failures.push("missing_h5_evidence_closeout_manifest");
  }

  let h5Payload = null;
  if (h5Path) {
    try {
      h5Payload = JSON.parse(await readFile(h5Path, "utf8"));
    } catch (e) {
      failures.push(`h5_closeout_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h5Payload && typeof h5Payload === "object") {
    if (h5Payload.pass !== true) {
      failures.push("h5_evidence_bundle_pass_false");
    }
    if (h5Payload.checks?.horizonCloseoutGatePass !== true) {
      failures.push("h5_evidence_bundle_horizonCloseoutGatePass_false");
    }
    if (h5Payload.closeout?.horizon !== undefined && h5Payload.closeout?.horizon !== "H5") {
      failures.push(`h5_closeout_unexpected_horizon:${String(h5Payload.closeout?.horizon)}`);
    }
  }

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h6-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    schemaVersion: "h6-closeout-v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H5",
      nextHorizon: "H6",
      canCloseHorizon: pass,
      canStartNextHorizon: pass,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h5EvidenceCloseoutPath: h5Path,
      outPath,
    },
    checks: {
      h6HorizonCloseoutGatePass: pass,
      horizonCloseoutGatePass: pass,
      h5EvidenceBundlePresent: Boolean(h5Path),
      h5EvidenceBundlePass: h5Payload?.pass === true,
      h5HorizonCloseoutGatePass: h5Payload?.checks?.horizonCloseoutGatePass === true,
    },
    upstream: h5Payload
      ? {
          path: h5Path,
          pass: h5Payload.pass,
          checks: h5Payload.checks ?? null,
          failures: Array.isArray(h5Payload.failures) ? h5Payload.failures : [],
        }
      : null,
    notes: {
      goalPolicyTransition: "H5->H6",
      goalPolicySources: ["docs/GOAL_POLICIES.json", "docs/HORIZON_STATUS.json goalPolicies"],
      promoteHorizonCloseoutFile:
        "Pin the newest h6-closeout-*.json from npm run validate:h6-closeout (or the underlying h5-closeout-*.json) on npm run promote:horizon -- --horizon H5 --next-horizon H6 --closeout-file <path> --goal-policy-key H5->H6; add --strict-goal-policy-gates when policy matrix must pass.",
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
      checks: { ...manifest.checks, h6HorizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`);
  if (!manifest.pass) {
    process.stderr.write(`H6 closeout validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
