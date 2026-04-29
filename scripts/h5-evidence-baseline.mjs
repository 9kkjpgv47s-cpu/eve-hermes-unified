#!/usr/bin/env node
/**
 * H5 evidence baseline: soak SLO + validation summary signals + core evidence paths.
 * Writes evidence/h5-evidence-baseline-*.json for operators and validate:horizon-closeout (H5).
 */
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const o = { evidenceDir: "", out: "", maxSoakLines: Number.NaN, maxP95Ms: Number.NaN };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir") {
      o.evidenceDir = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--out") {
      o.out = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--max-soak-lines") {
      o.maxSoakLines = Number(argv[i + 1] ?? "NaN");
      i += 1;
    } else if (a === "--max-p95-ms") {
      o.maxP95Ms = Number(argv[i + 1] ?? "NaN");
      i += 1;
    }
  }
  return o;
}

function run(cmd, args, cwd = ROOT) {
  const r = spawnSync(cmd, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  return {
    ok: r.status === 0,
    status: r.status ?? -1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

async function newestMatching(dir, prefix, suffix) {
  const entries = await readdir(dir, { withFileTypes: true });
  const matches = entries
    .filter((e) => e.isFile() && e.name.startsWith(prefix) && e.name.endsWith(suffix))
    .map((e) => path.join(dir, e.name));
  if (matches.length === 0) {
    return null;
  }
  matches.sort();
  return matches[matches.length - 1];
}

function parseJsonFlexible(raw) {
  const s = String(raw ?? "").trim();
  if (!s) {
    return null;
  }
  try {
    return JSON.parse(s);
  } catch {
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(s.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function readEnvInt(name, fallback) {
  const v = Number(process.env[name] ?? "");
  if (Number.isFinite(v) && v > 0) {
    return Math.trunc(v);
  }
  return fallback;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opt.evidenceDir.trim() || path.join(ROOT, "evidence"));
  await mkdir(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = opt.out.trim()
    ? path.resolve(opt.out)
    : path.join(evidenceDir, `h5-evidence-baseline-${stamp}.json`);

  const maxSoakLines =
    Number.isFinite(opt.maxSoakLines) && opt.maxSoakLines > 0
      ? Math.trunc(opt.maxSoakLines)
      : readEnvInt("UNIFIED_H5_BASELINE_MAX_SOAK_LINES", 50_000);
  const maxP95Ms =
    Number.isFinite(opt.maxP95Ms) && opt.maxP95Ms > 0
      ? Math.trunc(opt.maxP95Ms)
      : readEnvInt("UNIFIED_H5_BASELINE_MAX_P95_LATENCY_MS", 10_000);

  const soakPath = await newestMatching(evidenceDir, "soak-", ".jsonl");
  const validationSummaryPath = await newestMatching(evidenceDir, "validation-summary-", ".json");
  const failureInjectionPath = await newestMatching(evidenceDir, "failure-injection-", ".txt");
  const cutoverPath = await newestMatching(evidenceDir, "cutover-readiness-", ".json");
  const regressionPath = await newestMatching(evidenceDir, "regression-eve-primary-", ".json");
  const emergencyPath = await newestMatching(evidenceDir, "emergency-rollback-bundle-", ".json");
  const h4CloseoutPath = await newestMatching(evidenceDir, "h4-closeout-evidence-", ".json");

  const h4CloseoutPath = await newestMatching(evidenceDir, "h4-closeout-evidence-", ".json");

  const pruneDryPath = path.join(evidenceDir, `evidence-prune-dry-run-${stamp}.json`);
  const pruneTtlRaw = Number(process.env.UNIFIED_EVIDENCE_PRUNE_TTL_DAYS ?? "");
  const pruneTtl = Number.isFinite(pruneTtlRaw) && pruneTtlRaw >= 0 ? Math.trunc(pruneTtlRaw) : 30;
  const skipPruneDry = String(process.env.UNIFIED_H5_BASELINE_SKIP_EVIDENCE_PRUNE_DRY_RUN ?? "").trim() === "1";
  let evidencePruneDryRunPass = true;
  let pruneDryRun = { status: -1, stderr: "" };
  let evidencePruneDryRunPayload = null;
  if (!skipPruneDry) {
    pruneDryRun = run(process.execPath, [
      path.join(ROOT, "scripts/prune-evidence.mjs"),
      "--evidence-dir",
      evidenceDir,
      "--ttl-days",
      String(pruneTtl),
      "--dry-run",
      "--out",
      pruneDryPath,
    ]);
    evidencePruneDryRunPayload = parseJsonFlexible(pruneDryRun.stdout);
    if (!evidencePruneDryRunPayload) {
      try {
        evidencePruneDryRunPayload = JSON.parse(await readFile(pruneDryPath, "utf8"));
      } catch {
        evidencePruneDryRunPayload = null;
      }
    }
    const vPrune = evidencePruneDryRunPayload
      ? validateManifestSchema("evidence-prune-run", evidencePruneDryRunPayload)
      : { valid: false };
    evidencePruneDryRunPass =
      Boolean(
        pruneDryRun.ok
        && vPrune.valid
        && evidencePruneDryRunPayload?.pass === true
        && evidencePruneDryRunPayload?.dryRun === true,
      );
  }

  let soakLineCount = 0;
  if (soakPath) {
    const soakRaw = await readFile(soakPath, "utf8");
    soakLineCount = soakRaw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0).length;
  }

  const sloOutPath = path.join(evidenceDir, `soak-slo-baseline-${stamp}.json`);
  let soakSloPayload = null;
  let soakSloPass = false;
  let soakSloRun = { status: -1, stderr: "" };
  if (soakPath) {
    soakSloRun = run(process.execPath, [
      path.join(ROOT, "scripts/validate-soak-slo.mjs"),
      "--file",
      soakPath,
      "--out",
      sloOutPath,
    ]);
    soakSloPayload = parseJsonFlexible(soakSloRun.stdout);
    if (!soakSloPayload) {
      try {
        soakSloPayload = JSON.parse(await readFile(sloOutPath, "utf8"));
      } catch {
        soakSloPayload = null;
      }
    }
    soakSloPass = Boolean(soakSloPayload?.pass === true && soakSloRun.ok);
  }

  let validationSummaryPayload = null;
  let validationSummaryGatePass = false;
  let p95LatencyMs = null;
  let p95BudgetPass = null;
  if (validationSummaryPath) {
    try {
      validationSummaryPayload = JSON.parse(await readFile(validationSummaryPath, "utf8"));
      validationSummaryGatePass = validationSummaryPayload?.gates?.passed === true;
      const p95 = Number(validationSummaryPayload?.metrics?.p95LatencyMs);
      p95LatencyMs = Number.isFinite(p95) ? p95 : null;
      if (p95LatencyMs !== null) {
        p95BudgetPass = p95LatencyMs <= maxP95Ms;
      }
    } catch {
      validationSummaryPayload = null;
    }
  }

  let emergencySchemaPass = null;
  if (emergencyPath) {
    try {
      const raw = await readFile(emergencyPath, "utf8");
      const v = validateManifestSchema("emergency-rollback-bundle", JSON.parse(raw));
      emergencySchemaPass = v.valid;
    } catch {
      emergencySchemaPass = false;
    }
  }

  let h4CloseoutPass = null;
  if (h4CloseoutPath) {
    try {
      const raw = await readFile(h4CloseoutPath, "utf8");
      const parsed = JSON.parse(raw);
      const v = validateManifestSchema("h4-closeout-evidence", parsed);
      h4CloseoutPass = v.valid && parsed.pass === true;
    } catch {
      h4CloseoutPass = false;
    }
  }

  const evidenceLineBudgetPass = soakPath ? soakLineCount <= maxSoakLines : false;
  const corePathsPresent = Boolean(
    soakPath && validationSummaryPath && failureInjectionPath && cutoverPath && regressionPath,
  );

  const pass =
    corePathsPresent
    && soakSloPass
    && validationSummaryGatePass
    && evidenceLineBudgetPass
    && p95BudgetPass !== false
    && (emergencyPath === null || emergencySchemaPass === true)
    && (h4CloseoutPath === null || h4CloseoutPass === true)
    && evidencePruneDryRunPass;

  const payload = {
    schemaVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    horizon: "H5",
    summary: "H5 evidence baseline: soak SLO, validation-summary gates, P95 budget, core artifact paths, evidence prune dry-run.",
    pass,
    thresholds: {
      maxSoakLines,
      maxP95LatencyMs: maxP95Ms,
    },
    files: {
      soakPath,
      soakSloReportPath: soakPath ? sloOutPath : null,
      validationSummaryPath,
      failureInjectionPath,
      cutoverReadinessPath: cutoverPath,
      regressionEvePrimaryPath: regressionPath,
      emergencyRollbackBundlePath: emergencyPath,
      h4CloseoutEvidencePath: h4CloseoutPath,
      evidencePruneDryRunPath: skipPruneDry ? null : pruneDryPath,
    },
    commands: {
      soakSlo: {
        command: "node scripts/validate-soak-slo.mjs --file <soak.jsonl> --out <soak-slo-baseline.json>",
        exitCode: soakPath ? soakSloRun.status : -1,
        pass: soakSloPass,
        ...(soakPath && !soakSloPass ? { stderrTail: soakSloRun.stderr.slice(-4000) } : {}),
      },
      evidencePruneDryRun: {
        command: `node scripts/prune-evidence.mjs --evidence-dir <evidence> --ttl-days ${pruneTtl} --dry-run --out evidence-prune-dry-run-*.json`,
        exitCode: skipPruneDry ? -1 : pruneDryRun.status,
        pass: evidencePruneDryRunPass,
        ...(skipPruneDry ? { skipped: true } : {}),
        ...(!skipPruneDry && !evidencePruneDryRunPass ? { stderrTail: pruneDryRun.stderr.slice(-4000) } : {}),
      },
    },
    checks: {
      coreArtifactPathsPresent: corePathsPresent,
      soakSloPass,
      validationSummaryGatePass,
      evidenceLineBudgetPass,
      soakLineCount,
      p95LatencyMs,
      p95BudgetPass,
      emergencyRollbackBundleSchemaPass: emergencyPath === null ? null : emergencySchemaPass === true,
      h4CloseoutEvidencePass: h4CloseoutPath === null ? null : h4CloseoutPass === true,
      evidencePruneDryRunPass,
    },
  };

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${outPath}\n`);
  if (!pass) {
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exitCode = 2;
});
