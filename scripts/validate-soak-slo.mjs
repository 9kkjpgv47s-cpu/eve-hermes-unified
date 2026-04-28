#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const o = {
    file: "",
    minSuccessRate: Number.NaN,
    maxPolicyFailureRate: Number.NaN,
    out: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--file") {
      o.file = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--min-success-rate") {
      o.minSuccessRate = Number(argv[i + 1] ?? "NaN");
      i += 1;
    } else if (a === "--max-policy-failure-rate") {
      o.maxPolicyFailureRate = Number(argv[i + 1] ?? "NaN");
      i += 1;
    } else if (a === "--out") {
      o.out = argv[i + 1] ?? "";
      i += 1;
    }
  }
  return o;
}

function isDispatchRecord(value) {
  return Boolean(value && typeof value === "object" && value.response && value.envelope);
}

function latencyMs(record) {
  const candidates = [record?.primaryState?.elapsedMs, record?.capabilityExecution?.elapsedMs, 0];
  for (const c of candidates) {
    const n = Number(c);
    if (Number.isFinite(n) && n >= 0) {
      return n;
    }
  }
  return 0;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  if (!opt.file.trim()) {
    throw new Error("Missing --file <soak.jsonl>");
  }
  const minSuccess =
    Number.isFinite(opt.minSuccessRate) && opt.minSuccessRate >= 0 && opt.minSuccessRate <= 1
      ? opt.minSuccessRate
      : Number(process.env.UNIFIED_SOAK_SLO_MIN_SUCCESS_RATE ?? "0.5");
  const maxPolicy =
    Number.isFinite(opt.maxPolicyFailureRate) && opt.maxPolicyFailureRate >= 0 && opt.maxPolicyFailureRate <= 1
      ? opt.maxPolicyFailureRate
      : Number(process.env.UNIFIED_SOAK_SLO_MAX_POLICY_FAILURE_RATE ?? "0.45");
  const resolved = path.resolve(opt.file);
  const raw = await readFile(resolved, "utf8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const records = [];
  for (const line of lines) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row?.soakMeta === true) {
      continue;
    }
    if (isDispatchRecord(row)) {
      records.push(row);
    }
  }
  const total = records.length;
  let success = 0;
  let policyFailures = 0;
  const elapsed = [];
  for (const r of records) {
    if (r?.response?.failureClass === "none") {
      success += 1;
    }
    if (r?.response?.failureClass === "policy_failure") {
      policyFailures += 1;
    }
    elapsed.push(latencyMs(r));
  }
  const successRate = total > 0 ? success / total : 0;
  const policyFailureRate = total > 0 ? policyFailures / total : 0;
  const sorted = [...elapsed].sort((a, b) => a - b);
  const p95Index =
    sorted.length === 0 ? -1 : Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const p95LatencyMs = p95Index >= 0 ? sorted[p95Index] : null;
  const gates = {
    minSuccessRate: minSuccess,
    maxPolicyFailureRate: maxPolicy,
    successRatePass: successRate >= minSuccess,
    policyFailureRatePass: policyFailureRate <= maxPolicy,
  };
  const pass = gates.successRatePass && gates.policyFailureRatePass;
  const payload = {
    schemaVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    pass,
    files: { soakPath: resolved },
    checks: {
      lineCount: lines.length,
      dispatchRecordCount: total,
      successCount: success,
      policyFailureCount: policyFailures,
      successRate,
      policyFailureRate,
      p95LatencyMs,
      gates,
    },
  };
  const outPath = opt.out.trim()
    ? path.resolve(opt.out)
    : path.join(path.dirname(resolved), `soak-slo-${new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "")}.json`);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!pass) {
    process.stderr.write(
      `Soak SLO validation failed: successRate=${successRate.toFixed(4)} policyFailureRate=${policyFailureRate.toFixed(4)}\n`,
    );
    process.exitCode = 2;
  }
}

main().catch((e) => {
  process.stderr.write(`${String(e)}\n`);
  process.exitCode = 2;
});
