import { appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { UnifiedDispatchResult } from "../contracts/types.js";
import { UNIFIED_DISPATCH_AUDIT_SCHEMA_VERSION } from "../contracts/dispatch-audit-version.js";

export type DispatchAuditLogOptions = {
  /** When > 0, if the log file exceeds this size (bytes), rotate before appending. */
  maxBytesBeforeRotate?: number;
  /** Bytes of the end of the current log to keep in the primary file after rotation (line-aligned). */
  retainBytesAfterRotate?: number;
  /** When > 0, delete rotated backups `<path>.N` where N exceeds this count (after a successful rotation). */
  rotateRetainBackupCount?: number;
};

function buildRecord(result: UnifiedDispatchResult): string {
  return JSON.stringify({
    auditSchemaVersion: UNIFIED_DISPATCH_AUDIT_SCHEMA_VERSION,
    recordedAtIso: new Date().toISOString(),
    traceId: result.envelope.traceId,
    chatId: result.envelope.chatId,
    messageId: result.envelope.messageId,
    routing: result.routing,
    primaryState: result.primaryState,
    fallbackState: result.fallbackState,
    fallbackInfo: result.fallbackInfo,
    capabilityDecision: result.capabilityDecision,
    capabilityExecution: result.capabilityExecution,
    response: result.response,
  });
}

async function shiftNumericAuditBackups(logPath: string, maxKeep: number): Promise<void> {
  if (maxKeep <= 1) {
    return;
  }
  const top = `${logPath}.${maxKeep}`;
  try {
    await rm(top, { force: true });
  } catch {
    // ignore
  }
  for (let n = maxKeep - 1; n >= 1; n -= 1) {
    const from = `${logPath}.${n}`;
    const to = `${logPath}.${n + 1}`;
    try {
      await rename(from, to);
    } catch {
      // missing is fine
    }
  }
}

/**
 * When the audit log grows past maxBytesBeforeRotate, move the full file to `<path>.1`
 * and replace the primary with the tail (last retainBytesAfterRotate bytes, line-aligned).
 */
async function maybeRotateAuditLogInPlace(
  logPath: string,
  maxBytesBeforeRotate: number,
  retainBytesAfterRotate: number,
  maxRotatedBackups: number,
): Promise<void> {
  if (maxBytesBeforeRotate <= 0) {
    return;
  }
  let size = 0;
  try {
    size = (await stat(logPath)).size;
  } catch {
    return;
  }
  if (size < maxBytesBeforeRotate) {
    return;
  }

  const raw = await readFile(logPath, "utf8");
  const retain = Math.max(0, Math.min(retainBytesAfterRotate, raw.length));
  let tail = raw.length >= retain ? raw.slice(raw.length - retain) : raw;
  const firstNl = tail.indexOf("\n");
  if (firstNl >= 0) {
    tail = tail.slice(firstNl + 1);
  }
  const tailBlock = tail.length === 0 ? "" : tail.endsWith("\n") ? tail : `${tail}\n`;

  const dir = path.dirname(logPath);
  const base = path.basename(logPath);
  const tmpPath = path.join(dir, `.${base}.${process.pid}.${Date.now()}.tmp`);
  const rotatedPath = `${logPath}.1`;

  await writeFile(tmpPath, tailBlock, "utf8");

  if (maxRotatedBackups > 1) {
    await shiftNumericAuditBackups(logPath, maxRotatedBackups);
  } else {
    try {
      await rm(rotatedPath, { force: true });
    } catch {
      // ignore
    }
  }
  try {
    await rename(logPath, rotatedPath);
  } catch {
    await rm(tmpPath, { force: true });
    return;
  }
  try {
    await rename(tmpPath, logPath);
  } catch {
    try {
      await rename(rotatedPath, logPath);
    } catch {
      // best-effort restore
    }
    await rm(tmpPath, { force: true });
    throw new Error(`audit_log_rotate_failed:${logPath}`);
  }
}

/**
 * Remove `<logPath>.N` files for N greater than retainCount (newest kept by highest N).
 */
export async function pruneRotatedAuditBackups(logPath: string, retainCount: number): Promise<void> {
  if (retainCount <= 0) {
    return;
  }
  const dir = path.dirname(logPath);
  const base = path.basename(logPath);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return;
  }
  const prefix = `${base}.`;
  const numbered = names
    .filter((name) => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)))
    .map((name) => ({
      name,
      n: Number(name.slice(prefix.length)),
      full: path.join(dir, name),
    }))
    .filter((x) => Number.isFinite(x.n) && x.n > 0)
    .sort((a, b) => b.n - a.n);

  const toDelete = numbered.slice(retainCount);
  for (const item of toDelete) {
    try {
      await rm(item.full, { force: true });
    } catch {
      // ignore per-file
    }
  }
}

export async function appendDispatchAuditLog(
  logPath: string,
  result: UnifiedDispatchResult,
  options?: DispatchAuditLogOptions,
): Promise<void> {
  const dir = path.dirname(logPath);
  await mkdir(dir, { recursive: true });

  const maxBytes = options?.maxBytesBeforeRotate ?? 0;
  const retainBytes = options?.retainBytesAfterRotate ?? 0;
  const retainBackups = options?.rotateRetainBackupCount ?? 0;
  if (maxBytes > 0) {
    await maybeRotateAuditLogInPlace(
      logPath,
      maxBytes,
      retainBytes > 0 ? retainBytes : Math.floor(maxBytes / 2),
      retainBackups > 0 ? retainBackups : 1,
    );
    if (retainBackups > 0) {
      await pruneRotatedAuditBackups(logPath, retainBackups);
    }
  }

  const record = buildRecord(result);
  await appendFile(logPath, `${record}\n`, "utf8");
}
