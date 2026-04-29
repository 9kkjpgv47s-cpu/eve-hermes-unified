import { readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

export type DispatchAuditRotationPolicy = {
  /** Maximum active log file size (bytes) before rotate; 0 = disabled. */
  maxBytes: number;
  /** Maximum generations to retain on disk (active file + rotated archives). Minimum 1. */
  retainCount: number;
};

function escapeRegexBasename(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Returns rotated archive filenames matching `${basename}.${timestamp}.jsonl` for a given log path.
 */
export async function listDispatchAuditRotatedFiles(logPath: string): Promise<string[]> {
  const dir = path.dirname(logPath);
  const base = path.basename(logPath);
  const pattern = new RegExp(`^${escapeRegexBasename(base)}\\.\\d+\\.jsonl$`);
  const entries = await readdir(dir);
  const matches = entries.filter((name) => pattern.test(name));
  const withStats = await Promise.all(
    matches.map(async (name) => {
      const full = path.join(dir, name);
      try {
        const s = await stat(full);
        return { full, mtimeMs: s.mtimeMs };
      } catch {
        return { full, mtimeMs: 0 };
      }
    }),
  );
  withStats.sort((a, b) => a.mtimeMs - b.mtimeMs);
  return withStats.map((x) => x.full);
}

/**
 * Deletes oldest rotated archives until total file count (active + archives) is <= retainCount.
 */
export async function enforceDispatchAuditRetention(logPath: string, retainCount: number): Promise<string[]> {
  const capped = Math.max(1, Math.floor(retainCount));
  const removed: string[] = [];
  const archives = await listDispatchAuditRotatedFiles(logPath);
  let activeExists = false;
  try {
    await stat(logPath);
    activeExists = true;
  } catch {
    activeExists = false;
  }
  let total = archives.length + (activeExists ? 1 : 0);
  for (const archivePath of archives) {
    if (total <= capped) {
      break;
    }
    try {
      await unlink(archivePath);
      removed.push(archivePath);
      total -= 1;
    } catch {
      // best-effort retention
    }
  }
  return removed;
}

export type MaybeRotateDispatchAuditLogResult = {
  rotated: boolean;
  /** Present when a rotate occurred. */
  rotatedToPath?: string;
  /** Archives removed by retention pass after rotate (if any). */
  removedPaths?: string[];
};

/**
 * When the active audit log exceeds maxBytes, rename it to a timestamped sibling and allow the next append to create a fresh file.
 */
export async function maybeRotateDispatchAuditLog(
  logPath: string,
  policy: DispatchAuditRotationPolicy,
): Promise<MaybeRotateDispatchAuditLogResult> {
  const maxBytes = policy.maxBytes;
  const retainCount = Math.max(1, Math.floor(policy.retainCount));
  if (maxBytes <= 0) {
    return { rotated: false };
  }
  let size = 0;
  try {
    const s = await stat(logPath);
    size = s.size;
  } catch {
    return { rotated: false };
  }
  if (size <= maxBytes) {
    return { rotated: false };
  }
  const rotatedToPath = `${logPath}.${Date.now()}.jsonl`;
  try {
    await rename(logPath, rotatedToPath);
  } catch {
    return { rotated: false };
  }
  const removedPaths = await enforceDispatchAuditRetention(logPath, retainCount);
  return { rotated: true, rotatedToPath, removedPaths };
}

/** Same size-based rotate + retention as dispatch audit; works for any append-only `*.jsonl` audit sink using `${path}.${timestamp}.jsonl` archives. */
export const maybeRotateAppendOnlyJsonlAuditLog = maybeRotateDispatchAuditLog;
