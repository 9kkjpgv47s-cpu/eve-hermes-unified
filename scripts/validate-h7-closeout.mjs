#!/usr/bin/env node
/**
 * H7 closeout gate (h7-action-2): wraps the latest H6 evidence-bundle manifest
 * (`h6-closeout-evidence-*.json` from `npm run validate:h6-evidence-bundle`) and emits
 * `h7-closeout-*.json` for operators pinning `promote:horizon` H6→H7 with
 * `--closeout-file` alongside `H6->H7` goal policy checks in docs/GOAL_POLICIES.json.
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
  const h6Path = await newestMatchingFile(
    evidenceDir,
    (n) => n.startsWith("h6-closeout-evidence-") && n.endsWith(".json"),
  );
  if (!h6Path) {
    failures.push("missing_h6_evidence_closeout_manifest");
  }

  let h6Payload = null;
  if (h6Path) {
    try {
      h6Payload = JSON.parse(await readFile(h6Path, "utf8"));
    } catch (e) {
      failures.push(`h6_closeout_evidence_manifest_unreadable:${String(e?.message ?? e)}`);
    }
  }

  if (h6Payload && typeof h6Payload === "object") {
    if (h6Payload.pass !== true) {
      failures.push("h6_evidence_bundle_pass_false");
    }
    if (h6Payload.checks?.horizonCloseoutGatePass !== true) {
      failures.push("h6_evidence_bundle_horizonCloseoutGatePass_false");
    }
    if (h6Payload.closeout?.horizon !== undefined && h6Payload.closeout?.horizon !== "H6") {
      failures.push(`h6_closeout_evidence_unexpected_horizon:${String(h6Payload.closeout?.horizon)}`);
    }
  }

  const pass = failures.length === 0;
  const outPath =
    opts.out ||
    path.join(evidenceDir, `h7-closeout-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);

  let manifest = {
    schemaVersion: "h7-closeout-v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    closeout: {
      horizon: "H6",
      nextHorizon: "H7",
      canCloseHorizon: pass,
      canStartNextHorizon: pass,
    },
    files: {
      evidenceDir,
      horizonStatusFile,
      h6EvidenceCloseoutPath: h6Path,
      outPath,
    },
    checks: {
      h7HorizonCloseoutGatePass: pass,
      horizonCloseoutGatePass: pass,
      h6EvidenceBundlePresent: Boolean(h6Path),
      h6EvidenceBundlePass: h6Payload?.pass === true,
      h6HorizonCloseoutGatePass: h6Payload?.checks?.horizonCloseoutGatePass === true,
    },
    upstream: h6Payload
      ? {
          path: h6Path,
          pass: h6Payload.pass,
          checks: h6Payload.checks ?? null,
          failures: Array.isArray(h6Payload.failures) ? h6Payload.failures : [],
        }
      : null,
    notes: {
      goalPolicyTransition: "H6->H7",
      goalPolicySources: ["docs/GOAL_POLICIES.json", "docs/HORIZON_STATUS.json goalPolicies"],
      promoteHorizonCloseoutFile:
        "Pin the newest h7-closeout-*.json from npm run validate:h7-closeout (or the underlying h6-closeout-evidence-*.json) on npm run promote:horizon -- --horizon H6 --next-horizon H7 --closeout-file <path> --goal-policy-key H6->H7; add --strict-goal-policy-gates when policy matrix must pass.",
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
      checks: { ...manifest.checks, h7HorizonCloseoutGatePass: false },
      failures: [...manifest.failures, ...schemaFailures],
    };
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  process.stdout.write(`${JSON.stringify({ pass: manifest.pass, outPath, failureCount: manifest.failures.length })}\n`);
  if (!manifest.pass) {
    process.stderr.write(`H7 closeout validation failed:\n- ${manifest.failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e?.message ?? e)}\n`);
  process.exitCode = 1;
});
