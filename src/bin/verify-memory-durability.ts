#!/usr/bin/env node
/**
 * Operator/CI helper: exercise file-backed unified memory across simulated process restarts.
 * Run: npx tsx src/bin/verify-memory-durability.ts --memory-file /tmp/mem.json [--cycles 3]
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileUnifiedMemoryStore } from "../memory/unified-memory-store.js";

function parseArgs(argv: string[]): { memoryFile: string; cycles: number } {
  let memoryFile = "";
  let cycles = 3;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--memory-file") {
      memoryFile = argv[i + 1] ?? "";
      i += 1;
    } else if (arg === "--cycles") {
      cycles = Math.max(1, Math.min(20, Number.parseInt(argv[i + 1] ?? "3", 10) || 3));
      i += 1;
    }
  }
  return { memoryFile, cycles };
}

async function runCycle(memoryFile: string, cycle: number): Promise<void> {
  const store = new FileUnifiedMemoryStore(memoryFile);
  const ns = `durability_verify_cycle_${String(cycle)}`;
  await store.set(
    { lane: "eve", namespace: ns, key: "k1" },
    `eve-val-${String(cycle)}`,
    { cycle: String(cycle) },
  );
  await store.set(
    { lane: "hermes", namespace: ns, key: "k2" },
    `hermes-val-${String(cycle)}`,
    { cycle: String(cycle) },
  );
  if (cycle % 2 === 0) {
    await store.delete({ lane: "eve", namespace: ns, key: "k1" });
  }
  const postCrash = new FileUnifiedMemoryStore(memoryFile);
  const e1 = await postCrash.get({ lane: "eve", namespace: ns, key: "k1" });
  const e2 = await postCrash.get({ lane: "hermes", namespace: ns, key: "k2" });
  if (cycle % 2 === 0) {
    if (e1 !== undefined) {
      throw new Error(`cycle_${String(cycle)}: expected eve k1 deleted after replay`);
    }
  } else if (!e1 || e1.value !== `eve-val-${String(cycle)}`) {
    throw new Error(`cycle_${String(cycle)}: eve k1 mismatch after replay`);
  }
  if (!e2 || e2.value !== `hermes-val-${String(cycle)}`) {
    throw new Error(`cycle_${String(cycle)}: hermes k2 mismatch after replay`);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  let { memoryFile, cycles } = parseArgs(argv);
  let ownDir: string | undefined;
  if (!memoryFile.trim()) {
    ownDir = await mkdtemp(path.join(os.tmpdir(), "mem-dur-verify-"));
    memoryFile = path.join(ownDir, "memory.json");
  }
  const report: Record<string, unknown> = {
    generatedAtIso: new Date().toISOString(),
    memoryFile: path.resolve(memoryFile),
    cycles,
    pass: false,
  };
  try {
    for (let c = 1; c <= cycles; c += 1) {
      await runCycle(memoryFile, c);
    }
    report.pass = true;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    if (ownDir) {
      await rm(ownDir, { recursive: true, force: true });
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 2;
  });
}
