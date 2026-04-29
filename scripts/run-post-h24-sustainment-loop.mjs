#!/usr/bin/env node
/**
 * Thin alias for the legacy post-H24 sustainment chain. Prefer **`npm run verify:sustainment-loop`** (post-H25).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const legacy = path.join(path.dirname(fileURLToPath(import.meta.url)), "run-post-h24-sustainment-loop-legacy.mjs");
const r = spawnSync(process.execPath, [legacy], { stdio: "inherit", env: process.env });
process.exit(r.status ?? 1);
