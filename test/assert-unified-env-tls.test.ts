import { describe, expect, it } from "vitest";
import { assertUnifiedControlPlaneEnv } from "../src/config/unified-control-plane-env.js";
import type { UnifiedControlPlaneEnv } from "../src/config/unified-control-plane-env.js";

function base(): UnifiedControlPlaneEnv {
  return {
    eveTaskDispatchScript: "/x",
    eveDispatchResultPath: "/y",
    eveLaneTimeoutMs: 180_000,
    hermesLaunchCommand: "python3",
    hermesLaunchArgs: [],
    hermesLaneTimeoutMs: 180_000,
    routerDefaultPrimary: "eve",
    routerDefaultFallback: "hermes",
    routerFailClosed: true,
    routerPolicyVersion: "v1",
    gatewayMode: "unified",
    memoryBackend: "memory",
    memoryFilePath: "m.json",
    strictConfig: false,
    telegramBotToken: "",
    telegramWebhookSecret: "",
    telegramWebhookPath: "/w",
    telegramWebhookHost: "127.0.0.1",
    telegramWebhookPort: 1,
    telegramWebhookSendReply: false,
    telegramWebhookPublicUrl: "",
    unifiedLaneIoRedact: true,
    unifiedLaneIoRedactCustom: "",
    telegramWebhookTlsCertPath: "",
    telegramWebhookTlsKeyPath: "",
  };
}

describe("assertUnifiedControlPlaneEnv TLS", () => {
  it("rejects partial TLS paths", () => {
    const c = base();
    c.telegramWebhookTlsCertPath = "/only/cert.pem";
    c.telegramWebhookTlsKeyPath = "";
    expect(() => assertUnifiedControlPlaneEnv(c)).toThrow(/TLS/);
  });
});
