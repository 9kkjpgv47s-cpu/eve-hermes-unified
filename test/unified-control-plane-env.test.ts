import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { applyLegacyUnifiedEnvShims, loadUnifiedControlPlaneEnv } from "../src/config/unified-control-plane-env.js";

describe("loadUnifiedControlPlaneEnv", () => {
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    const keys = [
      "EVE_TASK_DISPATCH_SCRIPT",
      "EVE_DISPATCH_SCRIPT",
      "EVE_DISPATCH_RESULT_PATH",
      "EVE_RESULT_PATH",
      "HERMES_LAUNCH_COMMAND",
      "HERMES_CMD",
      "UNIFIED_ROUTER_DEFAULT_PRIMARY",
      "ROUTER_PRIMARY",
      "UNIFIED_ROUTER_DEFAULT_FALLBACK",
      "ROUTER_FALLBACK",
      "UNIFIED_ROUTER_FAIL_CLOSED",
      "ROUTER_FAIL_CLOSED",
      "UNIFIED_TELEGRAM_GATEWAY_MODE",
    ];
    for (const k of keys) {
      snapshot[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(snapshot)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
  });

  it("maps legacy env names when canonical vars are unset", () => {
    process.env.EVE_DISPATCH_SCRIPT = "/legacy/eve.sh";
    process.env.EVE_RESULT_PATH = "/legacy/result.json";
    process.env.HERMES_CMD = "python3";
    process.env.ROUTER_PRIMARY = "hermes";
    process.env.ROUTER_FALLBACK = "none";
    process.env.ROUTER_FAIL_CLOSED = "0";

    applyLegacyUnifiedEnvShims();
    const c = loadUnifiedControlPlaneEnv();

    expect(c.eveTaskDispatchScript).toBe("/legacy/eve.sh");
    expect(c.eveDispatchResultPath).toBe("/legacy/result.json");
    expect(c.hermesLaunchCommand).toBe("python3");
    expect(c.routerDefaultPrimary).toBe("hermes");
    expect(c.routerDefaultFallback).toBe("none");
    expect(c.routerFailClosed).toBe(false);
  });
});
