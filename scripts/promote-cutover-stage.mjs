#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const VALID_STAGES = ["shadow", "canary", "majority", "full"];

function parseArgs(argv) {
  const options = {
    targetStage: "",
    currentStage: "",
    envFile: "",
    evidenceDir: "",
    horizonStatusFile: "",
    out: "",
    readinessOut: "",
    canaryChats: "",
    majorityPercent: "",
    timeoutMs: 120_000,
    dryRun: false,
    allowHorizonMismatch: false,
    evidenceSelectionMode: "latest",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--target-stage") {
      options.targetStage = value ?? "";
      index += 1;
    } else if (arg === "--current-stage") {
      options.currentStage = value ?? "";
      index += 1;
    } else if (arg === "--env-file") {
      options.envFile = value ?? "";
      index += 1;
    } else if (arg === "--evidence-dir") {
      options.evidenceDir = value ?? "";
      index += 1;
    } else if (arg === "--horizon-status-file") {
      options.horizonStatusFile = value ?? "";
      index += 1;
    } else if (arg === "--out") {
      options.out = value ?? "";
      index += 1;
    } else if (arg === "--readiness-out") {
      options.readinessOut = value ?? "";
      index += 1;
    } else if (arg === "--canary-chats") {
      options.canaryChats = value ?? "";
      index += 1;
    } else if (arg === "--majority-percent") {
      options.majorityPercent = value ?? "";
      index += 1;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(value ?? "120000");
      index += 1;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--allow-horizon-mismatch" || arg === "--ignore-horizon-target") {
      options.allowHorizonMismatch = true;
    } else if (arg === "--evidence-selection-mode") {
      options.evidenceSelectionMode = value ?? "";
      index += 1;
    }
  }
  return options;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeStage(value, fallback = "") {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (VALID_STAGES.includes(normalized)) {
    return normalized;
  }
  return fallback;
}

function nowStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "");
}

async function exists(targetPath) {
  if (!isNonEmptyString(targetPath)) {
    return false;
  }
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function parseEnvValue(text, key) {
  const pattern = new RegExp(`^${key}=([^\\n\\r]*)$`, "m");
  const match = pattern.exec(text);
  return match ? String(match[1] ?? "").trim() : "";
}

async function detectCurrentStageFromEnv(envFile) {
  if (!(await exists(envFile))) {
    return "";
  }
  const content = await readFile(envFile, "utf8");
  const cutoverStage = normalizeStage(parseEnvValue(content, "UNIFIED_ROUTER_CUTOVER_STAGE"));
  if (cutoverStage) {
    return cutoverStage;
  }
  return normalizeStage(parseEnvValue(content, "UNIFIED_ROUTER_STAGE"), "shadow");
}

async function readJsonMaybe(targetPath) {
  if (!(await exists(targetPath))) {
    return null;
  }
  try {
    return JSON.parse(await readFile(targetPath, "utf8"));
  } catch {
    return null;
  }
}

async function runCommand(argv, options) {
  const startedAt = Date.now();
  return await new Promise((resolve, reject) => {
    const [command, ...args] = argv;
    const child = spawn(command, args, {
      env: { ...process.env, ...(options?.env ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options?.timeoutMs ?? 120_000);
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        argv,
        code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        termination: timedOut ? "timeout" : signal ? "signal" : "exit",
      });
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidenceDir = path.resolve(options.evidenceDir || path.join(process.cwd(), "evidence"));
  const horizonStatusFile = path.resolve(
    options.horizonStatusFile || path.join(process.cwd(), "docs/HORIZON_STATUS.json"),
  );
  const envFile = path.resolve(
    options.envFile || process.env.UNIFIED_RUNTIME_ENV_FILE || path.join(process.env.HOME || "", ".openclaw/run/gateway.env"),
  );
  const requestedTargetStage = String(options.targetStage ?? "");
  const targetStage = normalizeStage(requestedTargetStage);
  const detectedCurrentStage = await detectCurrentStageFromEnv(envFile);
  const currentStage = normalizeStage(options.currentStage, detectedCurrentStage || "shadow");
  const stamp = nowStamp();
  const readinessOut = path.resolve(
    options.readinessOut || path.join(evidenceDir, `stage-promotion-readiness-${stamp}.json`),
  );
  const outPath = path.resolve(
    options.out || path.join(evidenceDir, `stage-promotion-execution-${stamp}.json`),
  );

  const failures = [];
  const selectionModeRaw = String(options.evidenceSelectionMode ?? "").trim().toLowerCase();
  const evidenceSelectionMode =
    selectionModeRaw === "latest-passing" || selectionModeRaw === "latest"
      ? selectionModeRaw
      : "latest";
  if (!VALID_STAGES.includes(targetStage)) {
    failures.push(`invalid_target_stage:${requestedTargetStage || "<empty>"}`);
  }
  if (
    selectionModeRaw.length > 0 &&
    selectionModeRaw !== "latest" &&
    selectionModeRaw !== "latest-passing"
  ) {
    failures.push(`invalid_evidence_selection_mode:${selectionModeRaw}`);
  }
  if (!VALID_STAGES.includes(currentStage)) {
    failures.push(`invalid_current_stage:${options.currentStage || detectedCurrentStage || "<empty>"}`);
  }
  if (!(await exists(horizonStatusFile))) {
    failures.push(`missing_horizon_status_file:${horizonStatusFile}`);
  }

  const readinessArgv = [
    "node",
    "scripts/check-stage-promotion-readiness.mjs",
    "--target-stage",
    targetStage || requestedTargetStage,
    "--current-stage",
    currentStage || "shadow",
    "--horizon-status-file",
    horizonStatusFile,
    "--evidence-dir",
    evidenceDir,
    "--out",
    readinessOut,
    "--evidence-selection-mode",
    evidenceSelectionMode,
  ];
  if (options.allowHorizonMismatch) {
    readinessArgv.push("--allow-horizon-mismatch");
  }
  const readinessCommand = await runCommand(readinessArgv, {
    timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120_000,
  });

  let readinessPayload = await readJsonMaybe(readinessOut);
  if (!readinessPayload && isNonEmptyString(readinessCommand.stdout)) {
    try {
      readinessPayload = JSON.parse(readinessCommand.stdout);
    } catch {
      readinessPayload = null;
    }
  }

  const readinessPassed = readinessCommand.code === 0 && readinessPayload?.pass === true;
  if (!readinessPassed) {
    failures.push("readiness_check_failed");
  }

  let applyCommand = null;
  let envStageAfter = detectedCurrentStage || null;
  let stageApplied = false;
  if (!options.dryRun && readinessPassed) {
    if (!(await exists(envFile))) {
      failures.push(`missing_env_file:${envFile}`);
    } else {
      const applyArgv = ["bash", "scripts/prod-cutover-stage.sh", targetStage];
      if (isNonEmptyString(options.canaryChats)) {
        applyArgv.push("--canary-chats", options.canaryChats);
      }
      if (isNonEmptyString(options.majorityPercent)) {
        applyArgv.push("--majority-percent", options.majorityPercent);
      }
      applyCommand = await runCommand(applyArgv, {
        timeoutMs: Number.isFinite(options.timeoutMs) ? options.timeoutMs : 120_000,
        env: {
          UNIFIED_RUNTIME_ENV_FILE: envFile,
        },
      });
      envStageAfter = await detectCurrentStageFromEnv(envFile);
      stageApplied = applyCommand.code === 0 && envStageAfter === targetStage;
      if (applyCommand.code !== 0) {
        failures.push("stage_apply_command_failed");
      }
      if (!stageApplied) {
        failures.push(`stage_not_applied:${String(envStageAfter ?? "<unknown>")}`);
      }
    }
  }

  const promoted = !options.dryRun && readinessPassed && stageApplied;
  const payload = {
    generatedAtIso: new Date().toISOString(),
    pass:
      failures.length === 0 &&
      readinessPassed &&
      (options.dryRun ? true : stageApplied),
    promoted,
    dryRun: options.dryRun,
    stage: {
      current: currentStage || null,
      target: targetStage || null,
      envStageBefore: detectedCurrentStage || null,
      envStageAfter: envStageAfter || null,
    },
    files: {
      evidenceDir,
      envFile,
      horizonStatusFile,
      readinessOut,
      outPath,
    },
    commands: {
      readiness: readinessCommand,
      apply: applyCommand,
    },
    checks: {
      readinessPassed,
      stageApplied,
      allowHorizonMismatch: options.allowHorizonMismatch,
      evidenceSelectionMode,
    },
    failures,
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!payload.pass) {
    process.stderr.write(`Stage promotion execution failed:\n- ${failures.join("\n- ")}\n`);
    process.exitCode = 2;
  }
}

main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
