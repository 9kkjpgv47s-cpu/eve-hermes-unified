import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Optional JSON config overlay (same keys as env). Applied only for keys not already set in `process.env`.
 * File: `unified.config.json` at repo root (next to `.env`).
 */
const ALLOWED_CONFIG_KEYS = new Set<string>([
  "EVE_TASK_DISPATCH_SCRIPT",
  "EVE_DISPATCH_RESULT_PATH",
  "EVE_LANE_TIMEOUT_MS",
  "HERMES_LAUNCH_COMMAND",
  "HERMES_LAUNCH_ARGS",
  "HERMES_LANE_TIMEOUT_MS",
  "UNIFIED_ROUTER_DEFAULT_PRIMARY",
  "UNIFIED_ROUTER_DEFAULT_FALLBACK",
  "UNIFIED_ROUTER_FAIL_CLOSED",
  "UNIFIED_ROUTER_POLICY_VERSION",
  "UNIFIED_TELEGRAM_GATEWAY_MODE",
  "UNIFIED_MEMORY_BACKEND",
  "UNIFIED_MEMORY_FILE_PATH",
  "UNIFIED_STRICT_CONFIG",
  "UNIFIED_EVIDENCE_DIR",
  "UNIFIED_LANE_IO_REDACT",
  "UNIFIED_LANE_IO_REDACT_CUSTOM",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_WEBHOOK_PATH",
  "TELEGRAM_WEBHOOK_HOST",
  "TELEGRAM_WEBHOOK_PORT",
  "TELEGRAM_WEBHOOK_SEND_REPLY",
  "TELEGRAM_WEBHOOK_PUBLIC_URL",
  "TELEGRAM_WEBHOOK_TLS_CERT",
  "TELEGRAM_WEBHOOK_TLS_KEY",
  "TELEGRAM_BOT_TOKEN_FILE",
  "UNIFIED_ZOD_VALIDATE",
  "UNIFIED_VALIDATE_PATHS",
  "UNIFIED_SOAK_MIN_SUCCESS_RATE",
  "UNIFIED_SOAK_MAX_WALL_MS",
  "UNIFIED_SOAK_MAX_P95_WALL_MS",
  "UNIFIED_SOAK_MAX_P95_LANE_MS",
]);

export async function loadUnifiedConfigFile(rootDir: string): Promise<void> {
  const filePath = path.join(rootDir, "unified.config.json");
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    process.stderr.write(`[unified-config] Ignoring invalid JSON in unified.config.json\n`);
    return;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return;
  }
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!ALLOWED_CONFIG_KEYS.has(key)) {
      continue;
    }
    if (process.env[key] !== undefined) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      process.env[key] = String(value);
    }
  }
}
