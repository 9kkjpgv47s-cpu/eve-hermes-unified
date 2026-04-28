#!/usr/bin/env node
/**
 * CI SLO gate: read latest soak-metrics-*.json and fail if success rate or latency SLOs are violated.
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
  wallClockMs?: number;
  p95DispatchWallMs?: number;
  p95LaneElapsedMs?: number;
};

function parseFloatEnv(name: string, fallback: number): number {
  const n = Number.parseFloat(process.env[name] ?? "");
  return Number.isFinite(n) ? n : fallback;
}

function parseArgs(argv: string[]): {
  evidenceDir: string;
  metricsFile?: string;
  minRate: number;
  maxWallMs: number;
  maxP95WallMs: number;
  maxP95LaneMs: number;
} {
  let evidenceDir = "";
  let metricsFile: string | undefined;
  let minRate = parseFloatEnv("UNIFIED_SOAK_MIN_SUCCESS_RATE", 1);
  minRate = Math.min(1, Math.max(0, minRate));
  let maxWallMs = parseFloatEnv("UNIFIED_SOAK_MAX_WALL_MS", Number.POSITIVE_INFINITY);
  let maxP95WallMs = parseFloatEnv("UNIFIED_SOAK_MAX_P95_WALL_MS", Number.POSITIVE_INFINITY);
  let maxP95LaneMs = parseFloatEnv("UNIFIED_SOAK_MAX_P95_LANE_MS", Number.POSITIVE_INFINITY);

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
    } else if (argv[i] === "--max-wall-ms" && argv[i + 1]) {
      const n = Number.parseFloat(argv[i + 1]);
      if (Number.isFinite(n)) {
        maxWallMs = n;
      }
      i += 1;
    } else if (argv[i] === "--max-p95-wall-ms" && argv[i + 1]) {
      const n = Number.parseFloat(argv[i + 1]);
      if (Number.isFinite(n)) {
        maxP95WallMs = n;
      }
      i += 1;
    } else if (argv[i] === "--max-p95-lane-ms" && argv[i + 1]) {
      const n = Number.parseFloat(argv[i + 1]);
      if (Number.isFinite(n)) {
        maxP95LaneMs = n;
      }
      i += 1;
    }
  }
  return { evidenceDir, metricsFile, minRate, maxWallMs, maxP95WallMs, maxP95LaneMs };
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
  const { evidenceDir: argDir, metricsFile: argFile, minRate, maxWallMs, maxP95WallMs, maxP95LaneMs } =
    parseArgs(argv);
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

  const wall = m.wallClockMs ?? 0;
  const p95Wall = m.p95DispatchWallMs;
  const p95Lane = m.p95LaneElapsedMs;

  const checks: Record<string, { value: number; limit: number; pass: boolean }> = {
    successRate: { value: rate, limit: minRate, pass: rate >= minRate },
  };
  if (Number.isFinite(maxWallMs) && maxWallMs < Number.POSITIVE_INFINITY && wall > 0) {
    checks.wallClockMs = { value: wall, limit: maxWallMs, pass: wall <= maxWallMs };
  }
  if (Number.isFinite(maxP95WallMs) && maxP95WallMs < Number.POSITIVE_INFINITY && p95Wall !== undefined) {
    checks.p95DispatchWallMs = { value: p95Wall, limit: maxP95WallMs, pass: p95Wall <= maxP95WallMs };
  }
  if (Number.isFinite(maxP95LaneMs) && maxP95LaneMs < Number.POSITIVE_INFINITY && p95Lane !== undefined) {
    checks.p95LaneElapsedMs = { value: p95Lane, limit: maxP95LaneMs, pass: p95Lane <= maxP95LaneMs };
  }

  const pass = Object.values(checks).every((c) => c.pass);
  process.stdout.write(
    `${JSON.stringify({ metricsPath, iterations, successCount: success, checks, pass }, null, 2)}\n`,
  );

  if (!checks.successRate.pass) {
    throw new Error(`[ci-slo] Soak success rate ${rate.toFixed(4)} below required ${minRate}`);
  }
  if (checks.wallClockMs && !checks.wallClockMs.pass) {
    throw new Error(`[ci-slo] wallClockMs ${wall} exceeds ${maxWallMs}`);
  }
  if (checks.p95DispatchWallMs && !checks.p95DispatchWallMs.pass) {
    throw new Error(`[ci-slo] p95DispatchWallMs ${p95Wall} exceeds ${maxP95WallMs}`);
  }
  if (checks.p95LaneElapsedMs && !checks.p95LaneElapsedMs.pass) {
    throw new Error(`[ci-slo] p95LaneElapsedMs ${p95Lane} exceeds ${maxP95LaneMs}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
