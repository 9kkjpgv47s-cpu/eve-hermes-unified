#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateManifestSchema } from "./validate-manifest-schema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const o = { evidenceDir: "", out: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--evidence-dir") {
      o.evidenceDir = argv[i + 1] ?? "";
      i += 1;
    } else if (a === "--out") {
      o.out = argv[i + 1] ?? "";
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

function parseMemoryAuditStdout(stdout) {
  const raw = String(stdout ?? "").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // fall through
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(opt.evidenceDir.trim() || path.join(ROOT, "evidence"));
  await mkdir(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
  const outPath = opt.out.trim()
    ? path.resolve(opt.out)
    : path.join(evidenceDir, `h4-closeout-evidence-${stamp}.json`);

  const vitest = run(process.execPath, [
    path.join(ROOT, "node_modules/vitest/vitest.mjs"),
    "run",
    "test/dispatch-conformance-fixtures.test.ts",
  ]);
  const fixturePass = vitest.ok;

  const memoryReportPath = path.join(evidenceDir, `memory-audit-report-${stamp}.json`);
  const mem = run(process.execPath, [
    path.join(ROOT, "node_modules/tsx/dist/cli.mjs"),
    path.join(ROOT, "src/bin/memory-audit-report.ts"),
  ]);
  let memoryAudit = parseMemoryAuditStdout(mem.stdout);
  if (memoryAudit && typeof memoryAudit === "object") {
    await writeFile(memoryReportPath, `${JSON.stringify(memoryAudit, null, 2)}\n`, "utf8");
  }
  const memoryAuditPass =
    memoryAudit?.pass === true
    && memoryAudit?.checks?.crossLaneInvariantPass === true
    && memoryAudit?.checks?.walReplayInvariantPass === true;

  let emergencyPath = await newestMatching(evidenceDir, "emergency-rollback-bundle-", ".json");
  let emergencySchemaPass = null;
  if (emergencyPath) {
    const raw = await readFile(emergencyPath, "utf8");
    const payload = JSON.parse(raw);
    const v = validateManifestSchema("emergency-rollback-bundle", payload);
    emergencySchemaPass = v.valid;
  }

  const pass =
    fixturePass
    && memoryAuditPass
    && (emergencyPath === null || emergencySchemaPass === true);

  const payload = {
    schemaVersion: "v1",
    generatedAtIso: new Date().toISOString(),
    horizon: "H4",
    summary: "H4 closeout bundle: dispatch fixture conformance + memory audit (+ optional emergency rollback bundle schema).",
    pass,
    commands: {
      dispatchFixtureTests: {
        command: "npx vitest run test/dispatch-conformance-fixtures.test.ts",
        exitCode: vitest.status,
        pass: fixturePass,
      },
      memoryAuditReport: {
        command: "npx tsx src/bin/memory-audit-report.ts",
        exitCode: mem.status,
        pass: memoryAuditPass,
      },
    },
    artifacts: {
      memoryAuditReportPath: memoryAudit ? memoryReportPath : null,
      memoryAuditReport: memoryAudit,
      emergencyRollbackBundlePath: emergencyPath,
    },
    checks: {
      dispatchFixtureConformancePass: fixturePass,
      memoryAuditReportPass: memoryAuditPass,
      emergencyRollbackBundleSchemaPass:
        emergencyPath === null ? null : emergencySchemaPass === true,
    },
  };

  if (!fixturePass) {
    payload.commands.dispatchFixtureTests.stderrTail = vitest.stderr.slice(-4000);
  }
  if (!memoryAuditPass) {
    payload.commands.memoryAuditReport.stderrTail = mem.stderr.slice(-4000);
  }

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
