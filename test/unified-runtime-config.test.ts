import { describe, expect, it } from "vitest";
import {
  loadUnifiedRuntimeEnvConfig,
} from "../src/config/unified-runtime-config.js";

type EnvSnapshot = Record<string, string>;

function baseEnv(overrides?: EnvSnapshot): EnvSnapshot {
  return {
    UNIFIED_ROUTER_DEFAULT_PRIMARY: "eve",
    UNIFIED_ROUTER_DEFAULT_FALLBACK: "hermes",
    UNIFIED_ROUTER_FAIL_CLOSED: "1",
    EVE_TASK_DISPATCH_SCRIPT: "/tmp/eve.sh",
    EVE_DISPATCH_RESULT_PATH: "/tmp/eve.json",
    HERMES_LAUNCH_COMMAND: "/bin/true",
    HERMES_LAUNCH_ARGS: "",
    ...overrides,
  };
}

function readFrom(envSnapshot: EnvSnapshot): (name: string) => string | undefined {
  return (name) => envSnapshot[name];
}

describe("loadUnifiedRuntimeEnvConfig", () => {
  it("uses unified env keys when present", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_DEFAULT_PRIMARY: "hermes",
          UNIFIED_ROUTER_DEFAULT_FALLBACK: "none",
          UNIFIED_ROUTER_FAIL_CLOSED: "0",
        }),
      ),
    );
    expect(config.routerConfig.defaultPrimary).toBe("hermes");
    expect(config.routerConfig.defaultFallback).toBe("none");
    expect(config.routerConfig.failClosed).toBe(false);
    expect(config.routerConfig.policyVersion).toBe("v1");
  });

  it("supports legacy-compatible fallback names for router defaults", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          UNIFIED_ROUTER_DEFAULT_PRIMARY: "",
          UNIFIED_ROUTER_DEFAULT_FALLBACK: "",
          UNIFIED_ROUTER_FAIL_CLOSED: "",
          ROUTER_DEFAULT_PRIMARY: "eve",
          ROUTER_DEFAULT_FALLBACK: "none",
          ROUTER_FAIL_CLOSED: "0",
        }),
      ),
    );
    expect(config.routerConfig.defaultPrimary).toBe("eve");
    expect(config.routerConfig.defaultFallback).toBe("none");
    expect(config.routerConfig.failClosed).toBe(false);
  });

  it("supports hermes launch command aliases", () => {
    const config = loadUnifiedRuntimeEnvConfig(
      readFrom(
        baseEnv({
          HERMES_LAUNCH_COMMAND: "",
          HERMES_LAUNCH_ARGS: "",
          UNIFIED_HERMES_LAUNCH_COMMAND: "python3",
          UNIFIED_HERMES_LAUNCH_ARGS: "-m hermes gateway",
        }),
      ),
    );
    expect(config.hermesLaunchCommand).toBe("python3");
    expect(config.hermesLaunchArgs).toEqual(["-m", "hermes", "gateway"]);
  });
});
