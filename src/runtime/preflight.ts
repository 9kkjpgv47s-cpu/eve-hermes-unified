import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { runCommandWithTimeout } from "../process/exec.js";

export type RuntimePreflightConfig = {
  enabled?: boolean;
  strict?: boolean;
  eveDispatchScript: string;
  eveDispatchResultPath: string;
  hermesLaunchCommand: string;
  unifiedMemoryStoreKind: "file" | "memory";
  unifiedMemoryFilePath: string;
  auditEnabled?: boolean;
  auditLogPath: string;
  /** H5: when strict and true, reject dispatch without tenant id. */
  tenantIsolationStrict?: boolean;
  /** H5: resolved tenant id after CLI/env merge (empty = missing). */
  dispatchTenantId?: string;
};

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function checkExecutablePath(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function checkCommandAvailable(command: string): Promise<boolean> {
  const trimmed = command.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.includes("/") || trimmed.startsWith(".")) {
    return checkExecutablePath(trimmed);
  }
  const lookup = await runCommandWithTimeout(
    ["bash", "-lc", `command -v ${shellEscape(trimmed)}`],
    { timeoutMs: 2_000 },
  );
  return lookup.code === 0;
}

async function checkWritableParent(filePath: string): Promise<boolean> {
  try {
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true });
    await access(dir, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function runRuntimePreflight(config: RuntimePreflightConfig): Promise<string[]> {
  if (!config.enabled) {
    return [];
  }

  const issues: string[] = [];

  const eveDispatchScriptOk = await checkExecutablePath(config.eveDispatchScript);
  if (!eveDispatchScriptOk) {
    issues.push(`EVE dispatch script is not executable: ${config.eveDispatchScript}`);
  }

  const hermesCommandOk = await checkCommandAvailable(config.hermesLaunchCommand);
  if (!hermesCommandOk) {
    issues.push(`Hermes launch command is unavailable: ${config.hermesLaunchCommand}`);
  }

  if (config.unifiedMemoryStoreKind === "file") {
    const memoryWritable = await checkWritableParent(config.unifiedMemoryFilePath);
    if (!memoryWritable) {
      issues.push(`Unified memory file path is not writable: ${config.unifiedMemoryFilePath}`);
    }
  }

  if (config.auditEnabled) {
    const auditWritable = await checkWritableParent(config.auditLogPath);
    if (!auditWritable) {
      issues.push(`Unified audit log path is not writable: ${config.auditLogPath}`);
    }
  }

  if (config.strict && config.tenantIsolationStrict) {
    const tid = config.dispatchTenantId?.trim() ?? "";
    if (!tid) {
      issues.push("Tenant isolation strict mode requires a non-empty tenant id (CLI --tenant-id or UNIFIED_DISPATCH_TENANT_ID).");
    }
  }

  if (issues.length > 0 && config.strict) {
    throw new Error(`Runtime preflight failed:\n- ${issues.join("\n- ")}`);
  }
  return issues;
}

export async function ensureUnifiedRuntimePreflight(
  config: RuntimePreflightConfig,
): Promise<void> {
  await runRuntimePreflight({
    ...config,
    enabled: config.enabled ?? true,
    strict: config.strict ?? true,
    auditEnabled: config.auditEnabled ?? true,
  });
}
