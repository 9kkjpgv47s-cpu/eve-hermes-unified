#!/usr/bin/env node
/**
 * CI SLO gate: read latest soak-metrics-*.json under evidence/ (or --metrics-file) and fail if success rate < min.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { resolvePackageRoot } from "../config/package-root.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedConfigFile } from "../config/load-unified-config-file.js";

type Metrics = {
  iterations?: number;
  successCount?: number;
  failureCount?: number;
};

function parseArgs(argv: string[]): { evidenceDir: string; metricsFile?: string; minRate: number } {
  let evidenceDir = "";
  let metricsFile: string | undefined;
  let minRate = Number.parseFloat(process.env.UNIFIED_SOAK_MIN_SUCCESS_RATE ?? "1");
  if (!Number.isFinite(minRate)) {
    minRate = 1;
  }
  minRate = Math.min(1, Math.max(0, minRate));

  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--evidence-dir" && argv[i + 1]) {
      evidenceDir = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--metrics-file" && argv[i + 1]) {
      metricsFile = argv[i + 1];
      i += 1;
    } else if (argv[i] === "--min-rate" && argv[i + 1]) {
      const n = Number.parseFloat(argv[i + 1]);
      if (Number.isFinite(n)) {
        minRate = Math.min(1, Math.max(0, n));
      }
      i += 1;
    }
  }
  return { evidenceDir, metricsFile, minRate };
}

async function findLatestMetrics(evidenceDir: string): Promise<string | undefined> {
  const names = await readdir(evidenceDir);
  const candidates = names.filter((n) => n.startsWith("soak-metrics-") && n.endsWith(".json"));
  let best: { path: string; mtime: number } | undefined;
  for (const name of candidates) {
    const full = path.join(evidenceDir, name);
    const st = await stat(full);
    const mtime = st.mtimeMs;
    if (!best || mtime > best.mtime) {
      best = { path: full, mtime };
    }
  }
  return best?.path;
}

async function main() {
  const rootDir = resolvePackageRoot(import.meta.url);
  await loadDotEnvFile(rootDir);
  await loadUnifiedConfigFile(rootDir);

  const argv = process.argv.slice(2);
  const { evidenceDir: argDir, metricsFile: argFile, minRate } = parseArgs(argv);
  const evidenceDir = argDir
    ? path.isAbsolute(argDir)
      ? argDir
      : path.join(rootDir, argDir)
    : path.join(rootDir, process.env.UNIFIED_EVIDENCE_DIR?.trim() || "evidence");

  const metricsPath = argFile
    ? path.isAbsolute(argFile)
      ? argFile
      : path.join(rootDir, argFile)
    : await findLatestMetrics(evidenceDir);

  if (!metricsPath) {
    process.stderr.write(`[ci-slo] No soak-metrics-*.json under ${evidenceDir}; skipping gate.\n`);
    return;
  }

  const raw = await readFile(metricsPath, "utf8");
  const m = JSON.parse(raw) as Metrics;
  const iterations = m.iterations ?? 0;
  const success = m.successCount ?? 0;
  if (iterations <= 0) {
    throw new Error(`[ci-slo] Invalid metrics file (iterations): ${metricsPath}`);
  }
  const rate = success / iterations;
  const payload = { metricsPath, iterations, successCount: success, rate, minRate, pass: rate >= minRate };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (rate < minRate) {
    throw new Error(`[ci-slo] Soak success rate ${rate.toFixed(4)} below required ${minRate}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
