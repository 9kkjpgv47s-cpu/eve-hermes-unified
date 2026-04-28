import type { LaneId } from "../contracts/types.js";
import { validateUnifiedControlPlaneEnvZod } from "./unified-env-zod.js";

export type UnifiedControlPlaneEnv = {
  eveTaskDispatchScript: string;
  eveDispatchResultPath: string;
  eveLaneTimeoutMs: number;
  hermesLaunchCommand: string;
  hermesLaunchArgs: string[];
  hermesLaneTimeoutMs: number;
  routerDefaultPrimary: LaneId;
  routerDefaultFallback: LaneId | "none";
  routerFailClosed: boolean;
  routerPolicyVersion: string;
  gatewayMode: "unified" | "legacy";
  memoryBackend: "memory" | "file";
  /** Relative to repo root when not absolute. */
  memoryFilePath: string;
  strictConfig: boolean;
  telegramBotToken: string;
  telegramWebhookSecret: string;
  telegramWebhookPath: string;
  telegramWebhookHost: string;
  telegramWebhookPort: number;
  /** When true, POST sendMessage with dispatch summary after each handled message. */
  telegramWebhookSendReply: boolean;
  /** Base URL for set-webhook CLI (e.g. https://example.com). Path is appended from telegramWebhookPath. */
  telegramWebhookPublicUrl: string;
  /** When true, redact lane stdout/stderr before attaching to DispatchState. */
  unifiedLaneIoRedact: boolean;
  /** Extra | or , separated regex sources for redaction. */
  unifiedLaneIoRedactCustom: string;
  /** Path to PEM for optional HTTPS webhook server. */
  telegramWebhookTlsCertPath: string;
  telegramWebhookTlsKeyPath: string;
};

function parseIntBounded(raw: string, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, n));
}

function parseLane(value: string, fallback: LaneId): LaneId {
  return value === "hermes" ? "hermes" : value === "eve" ? "eve" : fallback;
}

function parseFallbackLane(value: string): LaneId | "none" {
  if (value === "none") {
    return "none";
  }
  return parseLane(value, "hermes");
}

/**
 * Legacy env names (Phase 5 shims): applied only when the canonical variable is unset.
 */
export const LEGACY_ENV_ALIASES: ReadonlyArray<{ legacy: string; canonical: string }> = [
  { legacy: "EVE_DISPATCH_SCRIPT", canonical: "EVE_TASK_DISPATCH_SCRIPT" },
  { legacy: "EVE_RESULT_PATH", canonical: "EVE_DISPATCH_RESULT_PATH" },
  { legacy: "HERMES_CMD", canonical: "HERMES_LAUNCH_COMMAND" },
  { legacy: "ROUTER_PRIMARY", canonical: "UNIFIED_ROUTER_DEFAULT_PRIMARY" },
  { legacy: "ROUTER_FALLBACK", canonical: "UNIFIED_ROUTER_DEFAULT_FALLBACK" },
  { legacy: "ROUTER_FAIL_CLOSED", canonical: "UNIFIED_ROUTER_FAIL_CLOSED" },
];

export function applyLegacyUnifiedEnvShims(): void {
  const setIfUnset = (canonical: string, value: string | undefined) => {
    if (value && process.env[canonical] === undefined) {
      process.env[canonical] = value;
    }
  };
  for (const { legacy, canonical } of LEGACY_ENV_ALIASES) {
    setIfUnset(canonical, process.env[legacy]);
  }
}

export function emitLegacyEnvWarnings(writer: (line: string) => void = (m) => process.stderr.write(`${m}\n`)): void {
  if (process.env.VITEST === "true" || process.env.UNIFIED_SUPPRESS_LEGACY_WARNINGS === "1") {
    return;
  }
  for (const { legacy, canonical } of LEGACY_ENV_ALIASES) {
    if (process.env[legacy]?.trim()) {
      writer(`[unified-config] Deprecated env ${legacy} is set; prefer ${canonical}.`);
    }
  }
}

function env(name: string, fallback = ""): string {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function parseMemoryBackend(raw: string): "memory" | "file" {
  return raw.toLowerCase() === "file" ? "file" : "memory";
}

export function loadUnifiedControlPlaneEnv(): UnifiedControlPlaneEnv {
  emitLegacyEnvWarnings();
  applyLegacyUnifiedEnvShims();

  const launchArgs = env("HERMES_LAUNCH_ARGS", "-m hermes gateway")
    .split(/\s+/)
    .filter(Boolean);

  const gatewayRaw = env("UNIFIED_TELEGRAM_GATEWAY_MODE", "unified").toLowerCase();
  const gatewayMode: "unified" | "legacy" = gatewayRaw === "legacy" ? "legacy" : "unified";

  const memoryBackend = parseMemoryBackend(env("UNIFIED_MEMORY_BACKEND", "memory"));
  const memoryFilePath = env("UNIFIED_MEMORY_FILE_PATH", "memory/unified-memory.json");
  const strictConfig = env("UNIFIED_STRICT_CONFIG", "0") === "1";

  const telegramWebhookPort = parseIntBounded(env("TELEGRAM_WEBHOOK_PORT", "8787"), 8787, 1, 65_535);
  const telegramWebhookSendReply = env("TELEGRAM_WEBHOOK_SEND_REPLY", "0") === "1";
  const telegramWebhookPublicUrl = env("TELEGRAM_WEBHOOK_PUBLIC_URL", "").replace(/\/+$/, "");
  const unifiedLaneIoRedact = env("UNIFIED_LANE_IO_REDACT", "1") === "1";
  const unifiedLaneIoRedactCustom = env("UNIFIED_LANE_IO_REDACT_CUSTOM", "");
  const telegramWebhookTlsCertPath = env("TELEGRAM_WEBHOOK_TLS_CERT", "");
  const telegramWebhookTlsKeyPath = env("TELEGRAM_WEBHOOK_TLS_KEY", "");

  return {
    eveTaskDispatchScript: env(
      "EVE_TASK_DISPATCH_SCRIPT",
      "/Users/dominiceasterling/openclaw/scripts/eve-task-dispatch.sh",
    ),
    eveDispatchResultPath: env(
      "EVE_DISPATCH_RESULT_PATH",
      "/Users/dominiceasterling/.openclaw/state/eve-task-dispatch-last.json",
    ),
    eveLaneTimeoutMs: parseIntBounded(env("EVE_LANE_TIMEOUT_MS", "180000"), 180_000, 1_000, 3_600_000),
    hermesLaunchCommand: env("HERMES_LAUNCH_COMMAND", "python3"),
    hermesLaunchArgs: launchArgs,
    hermesLaneTimeoutMs: parseIntBounded(env("HERMES_LANE_TIMEOUT_MS", "180000"), 180_000, 1_000, 3_600_000),
    routerDefaultPrimary: parseLane(env("UNIFIED_ROUTER_DEFAULT_PRIMARY", "eve"), "eve"),
    routerDefaultFallback: parseFallbackLane(env("UNIFIED_ROUTER_DEFAULT_FALLBACK", "hermes")),
    routerFailClosed: env("UNIFIED_ROUTER_FAIL_CLOSED", "1") === "1",
    routerPolicyVersion: env("UNIFIED_ROUTER_POLICY_VERSION", "v1"),
    gatewayMode,
    memoryBackend,
    memoryFilePath,
    strictConfig,
    telegramBotToken: env("TELEGRAM_BOT_TOKEN", ""),
    telegramWebhookSecret: env("TELEGRAM_WEBHOOK_SECRET", ""),
    telegramWebhookPath: env("TELEGRAM_WEBHOOK_PATH", "/telegram/webhook"),
    telegramWebhookHost: env("TELEGRAM_WEBHOOK_HOST", "127.0.0.1"),
    telegramWebhookPort,
    telegramWebhookSendReply,
    telegramWebhookPublicUrl,
    unifiedLaneIoRedact,
    unifiedLaneIoRedactCustom,
    telegramWebhookTlsCertPath,
    telegramWebhookTlsKeyPath,
  };
}

export function assertUnifiedPathsConfigured(c: UnifiedControlPlaneEnv): void {
  if (!c.eveTaskDispatchScript.trim()) {
    throw new Error("EVE_TASK_DISPATCH_SCRIPT is required.");
  }
  if (!c.eveDispatchResultPath.trim()) {
    throw new Error("EVE_DISPATCH_RESULT_PATH is required.");
  }
  if (!c.hermesLaunchCommand.trim()) {
    throw new Error("HERMES_LAUNCH_COMMAND is required.");
  }
}

export function assertUnifiedControlPlaneEnv(c: UnifiedControlPlaneEnv): void {
  assertUnifiedPathsConfigured(c);
  if (c.memoryBackend === "file" && !c.memoryFilePath.trim()) {
    throw new Error("UNIFIED_MEMORY_FILE_PATH is required when UNIFIED_MEMORY_BACKEND=file.");
  }
  if (c.strictConfig) {
    if (c.routerDefaultPrimary !== "eve" && c.routerDefaultPrimary !== "hermes") {
      throw new Error("UNIFIED_ROUTER_DEFAULT_PRIMARY must be eve or hermes.");
    }
    const fb = c.routerDefaultFallback;
    if (fb !== "none" && fb !== "eve" && fb !== "hermes") {
      throw new Error("UNIFIED_ROUTER_DEFAULT_FALLBACK must be eve, hermes, or none.");
    }
  }
  const tlsCert = c.telegramWebhookTlsCertPath.trim();
  const tlsKey = c.telegramWebhookTlsKeyPath.trim();
  if ((tlsCert && !tlsKey) || (!tlsCert && tlsKey)) {
    throw new Error("Set both TELEGRAM_WEBHOOK_TLS_CERT and TELEGRAM_WEBHOOK_TLS_KEY for TLS, or neither.");
  }
  validateUnifiedControlPlaneEnvZod(c);
}
