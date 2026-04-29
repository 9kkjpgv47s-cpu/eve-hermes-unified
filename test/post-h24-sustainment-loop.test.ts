import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCommandWithTimeout } from "../src/process/exec.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function mergeEnv(extra: Record<string, string>): Record<string, string> {
  return { ...(process.env as Record<string, string>), ...extra };
}

const routerEnv: Record<string, string> = {
  UNIFIED_ROUTER_DEFAULT_PRIMARY: "hermes",
  UNIFIED_ROUTER_DEFAULT_FALLBACK: "none",
  UNIFIED_ROUTER_FAIL_CLOSED: "1",
  UNIFIED_ROUTER_CUTOVER_STAGE: "full",
  UNIFIED_MEMORY_STORE_KIND: "file",
  UNIFIED_MEMORY_FILE_PATH: "/tmp/eve-hermes-unified-memory-test.json",
  EVE_TASK_DISPATCH_SCRIPT: "/bin/true",
  EVE_DISPATCH_RESULT_PATH: "/tmp/eve-dispatch-test.json",
  HERMES_LAUNCH_COMMAND: "/bin/true",
  HERMES_LAUNCH_ARGS: "",
};

const releaseReadinessEnv: Record<string, string> = {
  ...routerEnv,
  UNIFIED_RELEASE_READINESS_RUN_VALIDATE_ALL: "0",
  UNIFIED_RELEASE_READINESS_SKIP_TEST: "1",
  UNIFIED_RELEASE_READINESS_EVIDENCE_MIN_SUCCESS_RATE: "0.95",
  UNIFIED_RELEASE_READINESS_EVIDENCE_MAX_P95_LATENCY_MS: "2500",
  UNIFIED_RELEASE_READINESS_EVIDENCE_REQUIRE_FAILURE_SCENARIOS: "1",
};

async function runValidateAllArtifactsExceptTests() {
  const chain =
    "npm run check && npm run build && npm run validate:failure-injection && npm run validate:soak && npm run validate:evidence-summary && npm run validate:regression-eve && npm run validate:cutover-readiness";
  const va = await runCommandWithTimeout(["bash", "-lc", chain], {
    timeoutMs: 300_000,
    env: mergeEnv(routerEnv),
  });
  expect(va.code).toBe(0);
}

async function seedMergeBundleInputs() {
  const gp = await runCommandWithTimeout(["npm", "run", "validate:goal-policy-file"], {
    timeoutMs: 60_000,
    env: mergeEnv({}),
  });
  expect(gp.code).toBe(0);
  await runValidateAllArtifactsExceptTests();
  const rr = await runCommandWithTimeout(["npm", "run", "validate:release-readiness"], {
    timeoutMs: 180_000,
    env: mergeEnv(releaseReadinessEnv),
  });
  expect(rr.code).toBe(0);
  const init = await runCommandWithTimeout(["npm", "run", "validate:initial-scope"], {
    timeoutMs: 120_000,
    env: mergeEnv({}),
  });
  expect(init.code).toBe(0);
}

describe("run-post-h24-sustainment-loop.mjs", () => {
  it("exposes verify:sustainment-loop:h24-legacy npm script (post-H24 terminal chain)", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h24-legacy"]).toContain("run-post-h24-sustainment-loop.mjs");
  });

  it("exposes verify:sustainment-loop npm script (post-H28 terminal chain)", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop"]).toContain("run-post-h28-sustainment-loop.mjs");
  });

  it(
    "emits pass and structured checks in post-H24 sustainment loop manifest",
    async () => {
      await seedMergeBundleInputs();
      const result = await runCommandWithTimeout(
        ["node", path.join(repoRoot, "scripts/run-post-h24-sustainment-loop.mjs")],
        {
          timeoutMs: 900_000,
          env: mergeEnv({ UNIFIED_CI_SOAK_ITERATIONS: "15" }),
        },
      );
      expect(result.code).toBe(0);
      const out = result.stdout.trim();
      const last = out.split("\n").filter(Boolean).pop() ?? "";
      const raw = await readFile(last, "utf8");
      const payload = JSON.parse(raw) as {
        pass?: boolean;
        checks?: {
          horizonStatusPass?: boolean;
          h17AssuranceBundlePass?: boolean;
          h18AssuranceBundlePass?: boolean;
          ciSoakSloGatePass?: boolean;
          unifiedEntrypointsEvidencePass?: boolean;
          shellUnifiedDispatchCiEvidencePass?: boolean;
          tenantIsolationEvidencePass?: boolean;
          h24AssuranceBundlePass?: boolean;
          h24CloseoutGatePass?: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks?.horizonStatusPass).toBe(true);
      expect(payload.checks?.h17AssuranceBundlePass).toBe(true);
      expect(payload.checks?.h18AssuranceBundlePass).toBe(true);
      expect(payload.checks?.ciSoakSloGatePass).toBe(true);
      expect(payload.checks?.unifiedEntrypointsEvidencePass).toBe(true);
      expect(payload.checks?.shellUnifiedDispatchCiEvidencePass).toBe(true);
      expect(payload.checks?.tenantIsolationEvidencePass).toBe(true);
      expect(payload.checks?.h24AssuranceBundlePass).toBe(true);
      expect(payload.checks?.h24CloseoutGatePass).toBe(true);
    },
    1_200_000,
  );

  it("validate:post-h24-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h24-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});
