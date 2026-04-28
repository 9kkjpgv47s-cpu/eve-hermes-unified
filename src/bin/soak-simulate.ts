#!/usr/bin/env node
/**
 * Soak simulation: mixed routing traffic, JSONL transcript + aggregate metrics JSON (evidence bundle).
 */
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolvePackageRoot } from "../config/package-root.js";
import { dispatchUnifiedMessage } from "../runtime/unified-dispatch.js";
import { buildUnifiedRuntimeFromEnv } from "../runtime/build-unified-runtime.js";
import { loadDotEnvFile } from "../config/env.js";
import { loadUnifiedConfigFile } from "../config/load-unified-config-file.js";

function parseIterations(argv: string[]): number {
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--iterations" && argv[i + 1]) {
      const n = Number.parseInt(argv[i + 1], 10);
      return Number.isFinite(n) && n > 0 ? Math.min(n, 50_000) : 20;
    }
  }
  const fromEnv = Number.parseInt(process.env.SOAK_ITERATIONS ?? "", 10);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? Math.min(fromEnv, 50_000) : 20;
}

async function main() {
  const rootDir = resolvePackageRoot(import.meta.url);
  await loadDotEnvFile(rootDir);
  await loadUnifiedConfigFile(rootDir);

  const iterations = parseIterations(process.argv.slice(2));
  const evidenceDir = (() => {
    const raw = process.env.UNIFIED_EVIDENCE_DIR?.trim();
    if (!raw) {
      return path.join(rootDir, "evidence");
    }
    return path.isAbsolute(raw) ? raw : path.join(rootDir, raw);
  })();
  await mkdir(evidenceDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonlPath = path.join(evidenceDir, `soak-${stamp}.jsonl`);
  const metricsPath = path.join(evidenceDir, `soak-metrics-${stamp}.json`);

  const { runtime } = await buildUnifiedRuntimeFromEnv(rootDir);

  let pass = 0;
  let fail = 0;
  let eve = 0;
  let hermes = 0;

  for (let i = 1; i <= iterations; i += 1) {
    let text: string;
    if (i % 3 === 0) {
      text = `@hermes summarize state ${i}`;
    } else if (i % 2 === 0) {
      text = `@cursor check status ${i}`;
    } else {
      text = `normal message ${i}`;
    }
    try {
      const result = await dispatchUnifiedMessage(runtime, {
        channel: "telegram",
        chatId: "777",
        messageId: String(i),
        text,
      });
      await appendFile(jsonlPath, `${JSON.stringify({ iteration: i, text, ...result })}\n`, "utf8");
      if (result.response.failureClass === "none") {
        pass += 1;
      } else {
        fail += 1;
      }
      if (result.response.laneUsed === "eve") {
        eve += 1;
      } else {
        hermes += 1;
      }
    } catch (error) {
      fail += 1;
      await appendFile(
        jsonlPath,
        `${JSON.stringify({ iteration: i, text, error: String(error) })}\n`,
        "utf8",
      );
    }
  }

  const metrics = {
    generatedAtIso: new Date().toISOString(),
    iterations,
    successCount: pass,
    failureCount: fail,
    laneEveCount: eve,
    laneHermesCount: hermes,
    jsonlPath,
  };
  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
