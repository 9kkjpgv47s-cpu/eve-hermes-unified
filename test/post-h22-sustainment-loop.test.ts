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

describe("sustainment loop npm scripts", () => {
  it("maps verify:sustainment-loop to post-H26 terminal chain", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop"]).toContain("run-post-h26-sustainment-loop.mjs");
  });

  it("exposes verify:sustainment-loop:h25-legacy for the prior post-H25-only chain", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h25-legacy"]).toContain("run-post-h25-sustainment-loop.mjs");
  });

  it("exposes verify:sustainment-loop:h24-legacy for the prior post-H24-only chain", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h24-legacy"]).toContain("run-post-h24-sustainment-loop.mjs");
  });

  it("exposes verify:sustainment-loop:h23-legacy for the prior post-H23-only chain", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h23-legacy"]).toContain("run-post-h23-sustainment-loop.mjs");
  });

  it("exposes verify:sustainment-loop:h22-legacy for the prior post-H22-only chain", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h22-legacy"]).toContain("run-post-h22-sustainment-loop.mjs");
  });
});

describe("run-post-h22-sustainment-loop.mjs", () => {
  it(
    "emits pass and structured checks in post-H22 sustainment loop manifest",
    async () => {
      await seedMergeBundleInputs();
      const result = await runCommandWithTimeout(
        ["node", path.join(repoRoot, "scripts/run-post-h22-sustainment-loop.mjs")],
        {
          timeoutMs: 540_000,
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
          h22CloseoutGatePass?: boolean;
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
      expect(payload.checks?.h22CloseoutGatePass).toBe(true);
    },
    900_000,
  );

  it("validate:post-h22-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h22-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});

describe("run-post-h23-sustainment-loop.mjs", () => {
  it(
    "emits pass and structured checks (post-H22 chain + region failover + H23 closeout gate)",
    async () => {
      await seedMergeBundleInputs();
      const result = await runCommandWithTimeout(
        ["node", path.join(repoRoot, "scripts/run-post-h23-sustainment-loop.mjs")],
        {
          timeoutMs: 600_000,
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
          postH22SustainmentLoopPass?: boolean;
          regionFailoverEvidencePass?: boolean;
          h23CloseoutGatePass?: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks?.postH22SustainmentLoopPass).toBe(true);
      expect(payload.checks?.regionFailoverEvidencePass).toBe(true);
      expect(payload.checks?.h23CloseoutGatePass).toBe(true);
    },
    900_000,
  );

  it("validate:post-h23-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h23-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});

describe("run-post-h24-sustainment-loop.mjs", () => {
  it(
    "emits pass and structured checks (post-H23 chain + agent remediation + H24 closeout gate)",
    async () => {
      await seedMergeBundleInputs();
      const result = await runCommandWithTimeout(
        ["node", path.join(repoRoot, "scripts/run-post-h24-sustainment-loop.mjs")],
        {
          timeoutMs: 660_000,
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
          postH23SustainmentLoopPass?: boolean;
          agentRemediationEvidencePass?: boolean;
          h24CloseoutGatePass?: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks?.postH23SustainmentLoopPass).toBe(true);
      expect(payload.checks?.agentRemediationEvidencePass).toBe(true);
      expect(payload.checks?.h24CloseoutGatePass).toBe(true);
    },
    900_000,
  );

  it("validate:post-h24-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h24-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});

describe("run-post-h25-sustainment-loop.mjs", () => {
  it(
    "emits pass and structured checks (post-H24 chain + emergency rollback + H25 closeout gate)",
    async () => {
      await seedMergeBundleInputs();
      const result = await runCommandWithTimeout(
        ["node", path.join(repoRoot, "scripts/run-post-h25-sustainment-loop.mjs")],
        {
          timeoutMs: 720_000,
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
          postH24SustainmentLoopPass?: boolean;
          emergencyRollbackEvidencePass?: boolean;
          h25CloseoutGatePass?: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks?.postH24SustainmentLoopPass).toBe(true);
      expect(payload.checks?.emergencyRollbackEvidencePass).toBe(true);
      expect(payload.checks?.h25CloseoutGatePass).toBe(true);
    },
    900_000,
  );

  it("validate:post-h25-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h25-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});

describe("run-post-h26-sustainment-loop.mjs", () => {
  it(
    "emits pass and structured checks (post-H25 chain + failure-injection + H26 closeout gate)",
    async () => {
      await seedMergeBundleInputs();
      const result = await runCommandWithTimeout(
        ["node", path.join(repoRoot, "scripts/run-post-h26-sustainment-loop.mjs")],
        {
          timeoutMs: 780_000,
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
          postH25SustainmentLoopPass?: boolean;
          failureInjectionEvidencePass?: boolean;
          h26CloseoutGatePass?: boolean;
        };
      };
      expect(payload.pass).toBe(true);
      expect(payload.checks?.postH25SustainmentLoopPass).toBe(true);
      expect(payload.checks?.failureInjectionEvidencePass).toBe(true);
      expect(payload.checks?.h26CloseoutGatePass).toBe(true);
    },
    900_000,
  );

  it("validate:post-h26-sustainment-manifest passes on latest loop output", async () => {
    const result = await runCommandWithTimeout(
      ["node", path.join(repoRoot, "scripts/validate-post-h26-sustainment-manifest.mjs")],
      { timeoutMs: 15_000 },
    );
    expect(result.code).toBe(0);
  });
});
