import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { validateUnifiedControlPlaneEnvZod } from "../src/config/unified-env-zod.js";
import type { UnifiedControlPlaneEnv } from "../src/config/unified-control-plane-env.js";

function base(): UnifiedControlPlaneEnv {
  return {
    eveTaskDispatchScript: "/x",
    eveDispatchResultPath: "/y",
    eveLaneTimeoutMs: 180_000,
    hermesLaunchCommand: "python3",
    hermesLaunchArgs: ["-m", "x"],
    hermesLaneTimeoutMs: 180_000,
    routerDefaultPrimary: "eve",
    routerDefaultFallback: "hermes",
    routerFailClosed: true,
    routerPolicyVersion: "v1",
    gatewayMode: "unified",
    memoryBackend: "memory",
    memoryFilePath: "memory/x.json",
    strictConfig: false,
    telegramBotToken: "",
    telegramWebhookSecret: "",
    telegramWebhookPath: "/telegram/webhook",
    telegramWebhookHost: "127.0.0.1",
    telegramWebhookPort: 8787,
    telegramWebhookSendReply: false,
    telegramWebhookPublicUrl: "",
    unifiedLaneIoRedact: true,
    unifiedLaneIoRedactCustom: "",
    telegramWebhookTlsCertPath: "",
    telegramWebhookTlsKeyPath: "",
  };
}

describe("validateUnifiedControlPlaneEnvZod", () => {
  const snap = process.env.UNIFIED_ZOD_VALIDATE;

  beforeEach(() => {
    delete process.env.UNIFIED_ZOD_VALIDATE;
  });

  afterEach(() => {
    if (snap === undefined) {
      delete process.env.UNIFIED_ZOD_VALIDATE;
    } else {
      process.env.UNIFIED_ZOD_VALIDATE = snap;
    }
  });

  it("no-ops when UNIFIED_ZOD_VALIDATE unset and strictConfig false", () => {
    const c = base();
    c.telegramWebhookPort = 999_999;
    expect(() => validateUnifiedControlPlaneEnvZod(c)).not.toThrow();
  });

  it("throws on invalid port when UNIFIED_ZOD_VALIDATE=1", () => {
    process.env.UNIFIED_ZOD_VALIDATE = "1";
    const c = base();
    c.telegramWebhookPort = 999_999;
    expect(() => validateUnifiedControlPlaneEnvZod(c)).toThrow();
  });
});
