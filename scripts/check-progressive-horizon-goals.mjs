#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateHorizonStatus } from "./validate-horizon-status.mjs";

const HORIZON_SEQUENCE = ["H1", "H2", "H3", "H4", "H5"];

function parseArgs(argv) {
  const options = {
    horizonStatusFile: "",
    sourceHorizon: "",
    nextHorizon: "",
    out: "",
    minimumGoalIncrease: 1,
    minActionGrowthFactor: Number.NaN,
    minPendingNextActions: 1,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--source-horizon") {
      options.sourceHorizon = value ?? "";
      index += 1;
    } else if (arg === "--next-horizon") {
      options.nextHorizon = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--minimum-goal-increase" || arg === "--min-goal-increase") {
      const parsed = Number(value ?? "1");
      options.minimumGoalIncrease = parsed;
      options.minActionGrowthFactor = parsed;
      index += 1;
    } else if (arg === "--min-action-growth-factor") {
      options.minActionGrowthFactor = Number(value ?? "1");
      index += 1;
    } else if (
      arg === "--min-pending-next-actions" ||
      arg === "--minimum-pending-next-actions"
    ) {
      options.minPendingNextActions = Number(value ?? "1");
      index += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeHorizon(value, fallback = "") {
  const normalized = String(value ?? "").trim().toUpperCase();
  return HORIZON_SEQUENCE.includes(normalized) ? normalized : fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

function isFinitePositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const horizonStatus = JSON.parse(await readFile(horizonStatusFile, "utf8"));
  const validation = validateHorizonStatus(horizonStatus);
  const sourceHorizon = normalizeHorizon(options.sourceHorizon, horizonStatus?.activeHorizon ?? "");
  const sourceIndex = HORIZON_SEQUENCE.indexOf(sourceHorizon);
  const derivedNext = sourceIndex >= 0 ? HORIZON_SEQUENCE[sourceIndex + 1] ?? "" : "";
  const nextHorizon = normalizeHorizon(options.nextHorizon, derivedNext);
  const outPath = path.resolve(
    options.out ||
      path.join(
        process.cwd(),
        "evidence",
        `progressive-horizon-goals-${sourceHorizon || "unknown"}-to-${nextHorizon || "unknown"}-${stamp()}.json`,
      ),
  );

  const failures = [];
  if (!validation.valid) {
    failures.push(...validation.errors.map((error) => `horizon_status_invalid:${error}`));
  }
  if (!sourceHorizon) {
    failures.push(`invalid_source_horizon:${String(options.sourceHorizon ?? "<empty>")}`);
  }
  if (!nextHorizon) {
    failures.push(`invalid_next_horizon:${String(options.nextHorizon ?? "<empty>")}`);
  }
  if (
    !Number.isFinite(options.minimumGoalIncrease) ||
    !Number.isInteger(options.minimumGoalIncrease) ||
    options.minimumGoalIncrease < 0
  ) {
    failures.push(`invalid_minimum_goal_increase:${String(options.minimumGoalIncrease)}`);
  }
  if (!isFinitePositiveNumber(options.minActionGrowthFactor)) {
    options.minActionGrowthFactor = Number.NaN;
  }
  if (
    !Number.isFinite(options.minPendingNextActions) ||
    !Number.isInteger(options.minPendingNextActions) ||
    options.minPendingNextActions < 0
  ) {
    failures.push(`invalid_min_pending_next_actions:${String(options.minPendingNextActions)}`);
  }

  const sourceActions = Array.isArray(horizonStatus?.nextActions)
    ? horizonStatus.nextActions.filter(
        (action) =>
          action &&
          typeof action === "object" &&
          String(action.targetHorizon ?? "").trim().toUpperCase() === sourceHorizon,
      )
    : [];
  const nextActions = Array.isArray(horizonStatus?.nextActions)
    ? horizonStatus.nextActions.filter(
        (action) =>
          action &&
          typeof action === "object" &&
          String(action.targetHorizon ?? "").trim().toUpperCase() === nextHorizon,
      )
    : [];
  const nextPendingActions = nextActions.filter(
    (action) => String(action?.status ?? "").trim().toLowerCase() !== "completed",
  );

  const sourceActionCount = sourceActions.length;
  const nextActionCount = nextActions.length;
  const nextPendingActionCount = nextPendingActions.length;
  const goalDelta = nextActionCount - sourceActionCount;

  let requiredNextActionCount = Math.max(
    1,
    options.minPendingNextActions,
    sourceActionCount + options.minimumGoalIncrease,
  );
  if (sourceActionCount > 0 && isFinitePositiveNumber(options.minActionGrowthFactor)) {
    requiredNextActionCount = Math.max(
      requiredNextActionCount,
      Math.ceil(sourceActionCount * options.minActionGrowthFactor),
    );
  }

  if (goalDelta < options.minimumGoalIncrease) {
    failures.push(
      `insufficient_goal_increase:${String(goalDelta)}<${String(options.minimumGoalIncrease)}`,
    );
  }
  if (nextActionCount < requiredNextActionCount) {
    failures.push(
      `next_action_count_below_growth_target:${String(nextActionCount)}<${String(requiredNextActionCount)}`,
    );
  }
  if (nextPendingActionCount < options.minPendingNextActions) {
    failures.push(
      `next_pending_action_count_below_min:${String(nextPendingActionCount)}<${String(options.minPendingNextActions)}`,
    );
  }

  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass: failures.length === 0,
    files: {
      horizonStatusFile,
      outPath,
    },
    horizons: {
      source: sourceHorizon || null,
      next: nextHorizon || null,
    },
    checks: {
      sourceActionCount,
      nextActionCount,
      goalDelta,
      nextPendingActionCount,
      minimumGoalIncrease: options.minimumGoalIncrease,
      minActionGrowthFactor: options.minActionGrowthFactor,
      minPendingNextActions: options.minPendingNextActions,
      requiredNextActionCount,
      actionGrowthRatio: sourceActionCount > 0 ? nextActionCount / sourceActionCount : null,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Progressive horizon goal check failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
