#!/usr/bin/env node
/**
 * Validates the newest evidence/post-h13-sustainment-loop-*.json (after npm run verify:sustainment-loop).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const evidenceDir = path.resolve(process.cwd(), process.env.POST_H13_SUSTAINMENT_EVIDENCE_DIR ?? "evidence");

async function pickLoopManifest(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.startsWith("post-h13-sustainment-loop-") && e.name.endsWith(".json"))
    .map((e) => path.join(dir, e.name));
  if (files.length === 0) {
    return "";
  }
  const scored = await Promise.all(
    files.map(async (filePath) => {
      const st = await stat(filePath);
      let pass = false;
      try {
        const raw = await readFile(filePath, "utf8");
        pass = JSON.parse(raw)?.pass === true;
      } catch {
        pass = false;
      }
      return { filePath, mtimeMs: st.mtimeMs, pass };
    }),
  );
  scored.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latestPass = scored.find((row) => row.pass);
  return latestPass?.filePath ?? scored[0].filePath;
}

const manifestPath = await pickLoopManifest(evidenceDir);
if (!manifestPath) {
  process.stderr.write(`No evidence/post-h13-sustainment-loop-*.json under ${evidenceDir}\n`);
  process.exit(2);
}

const raw = await readFile(manifestPath, "utf8");
const payload = JSON.parse(raw);
const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {};

const failures = [];
if (payload.pass !== true) failures.push("pass_not_true");
if (checks.horizonStatusPass !== true) failures.push("horizonStatusPass");
if (checks.h13AssuranceBundlePass !== true) failures.push("h13AssuranceBundlePass");
if (checks.h13CloseoutGatePass !== true) failures.push("h13CloseoutGatePass");

if (failures.length > 0) {
  process.stderr.write(`Invalid post-H13 sustainment manifest ${manifestPath}: ${failures.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`${manifestPath}\n`);
