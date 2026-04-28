#!/usr/bin/env node
/**
 * JSON report for H4 memory / WAL invariants (cross-lane keys + snapshot+journal replay).
 * Used by `scripts/h4-closeout-evidence.mjs` and horizon closeout evidence gates.
 */
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileUnifiedMemoryStore,
  buildMemoryMapFromSnapshotAndJournal,
  createMemoryStorageKey,
} from "../memory/unified-memory-store.js";

const SCHEMA_VERSION = 1;

async function auditOnce(memoryFile: string, journalPath: string): Promise<void> {
  const ns = `h4_memory_audit_${Date.now().toString(36)}`;
  const store = new FileUnifiedMemoryStore(memoryFile, journalPath, {
    verifyPersist: true,
    verifyJournalReplay: true,
  });
  await store.set({ lane: "eve", namespace: ns, key: "lane-key" }, "eve-audit", {});
  await store.set({ lane: "hermes", namespace: ns, key: "lane-key" }, "hermes-audit", {});
  const afterRestart = new FileUnifiedMemoryStore(memoryFile, journalPath);
  const eveRead = await afterRestart.get({ lane: "eve", namespace: ns, key: "lane-key" });
  const hermesRead = await afterRestart.get({ lane: "hermes", namespace: ns, key: "lane-key" });
  if (!eveRead || eveRead.value !== "eve-audit") {
    throw new Error("cross_lane_invariant_failed:eve_value_mismatch_after_restart");
  }
  if (!hermesRead || hermesRead.value !== "hermes-audit") {
    throw new Error("cross_lane_invariant_failed:hermes_value_mismatch_after_restart");
  }
  const rebuilt = await buildMemoryMapFromSnapshotAndJournal(memoryFile, journalPath);
  const skEve = createMemoryStorageKey({ lane: "eve", namespace: ns, key: "lane-key" });
  const skHermes = createMemoryStorageKey({ lane: "hermes", namespace: ns, key: "lane-key" });
  if (!rebuilt.has(skEve) || rebuilt.get(skEve)?.value !== "eve-audit") {
    throw new Error("wal_replay_invariant_failed:eve_map_mismatch");
  }
  if (!rebuilt.has(skHermes) || rebuilt.get(skHermes)?.value !== "hermes-audit") {
    throw new Error("wal_replay_invariant_failed:hermes_map_mismatch");
  }
}

async function main() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "h4-mem-audit-"));
  const memoryFile = path.join(dir, "memory.json");
  const journalPath = path.join(dir, "memory.journal");
  const report: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    generatedAtIso: new Date().toISOString(),
    summary: "Cross-lane file-backed memory + WAL replay invariants for H4 retirement audit.",
    pass: false,
    memoryFile: path.resolve(memoryFile),
    journalPath: path.resolve(journalPath),
    checks: {
      crossLaneInvariantPass: false,
      walReplayInvariantPass: false,
    },
  };
  try {
    await auditOnce(memoryFile, journalPath);
    (report.checks as Record<string, boolean>).crossLaneInvariantPass = true;
    (report.checks as Record<string, boolean>).walReplayInvariantPass = true;
    report.pass = true;
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } catch (err) {
    report.error = String(err);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = 2;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 2;
  });
}
