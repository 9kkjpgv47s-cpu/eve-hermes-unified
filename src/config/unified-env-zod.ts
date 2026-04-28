import { z } from "zod";
import type { LaneId } from "../contracts/types.js";
import type { UnifiedControlPlaneEnv } from "./unified-control-plane-env.js";

const laneId = z.enum(["eve", "hermes"]);
const fallbackLane = z.enum(["eve", "hermes", "none"]);
const memoryBackend = z.enum(["memory", "file"]);
const gatewayMode = z.enum(["unified", "legacy"]);

const unifiedEnvSchema = z.object({
  eveLaneTimeoutMs: z.number().int().min(1_000).max(3_600_000),
  hermesLaneTimeoutMs: z.number().int().min(1_000).max(3_600_000),
  routerDefaultPrimary: laneId,
  routerDefaultFallback: fallbackLane,
  routerPolicyVersion: z.string().min(1).max(128),
  gatewayMode,
  memoryBackend,
  memoryFilePath: z.string().max(4096),
  telegramWebhookPort: z.number().int().min(1).max(65_535),
  telegramWebhookPath: z.string().min(1).max(2048),
  telegramWebhookHost: z.string().min(1).max(256),
  telegramWebhookPublicUrl: z.string().max(4096),
  unifiedLaneIoRedactCustom: z.string().max(16_384),
});

function envToZodInput(c: UnifiedControlPlaneEnv): z.infer<typeof unifiedEnvSchema> {
  return {
    eveLaneTimeoutMs: c.eveLaneTimeoutMs,
    hermesLaneTimeoutMs: c.hermesLaneTimeoutMs,
    routerDefaultPrimary: c.routerDefaultPrimary as LaneId,
    routerDefaultFallback: c.routerDefaultFallback,
    routerPolicyVersion: c.routerPolicyVersion,
    gatewayMode: c.gatewayMode,
    memoryBackend: c.memoryBackend,
    memoryFilePath: c.memoryFilePath,
    telegramWebhookPort: c.telegramWebhookPort,
    telegramWebhookPath: c.telegramWebhookPath,
    telegramWebhookHost: c.telegramWebhookHost,
    telegramWebhookPublicUrl: c.telegramWebhookPublicUrl,
    unifiedLaneIoRedactCustom: c.unifiedLaneIoRedactCustom,
  };
}

/**
 * Validates control-plane fields with Zod when `UNIFIED_ZOD_VALIDATE=1` or `strictConfig` is true.
 */
export function validateUnifiedControlPlaneEnvZod(c: UnifiedControlPlaneEnv): void {
  const wantZod = c.strictConfig || process.env.UNIFIED_ZOD_VALIDATE === "1";
  if (!wantZod) {
    return;
  }
  unifiedEnvSchema.parse(envToZodInput(c));
}
