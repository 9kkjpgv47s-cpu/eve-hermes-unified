import { rename, stat, unlink, writeFile } from "node:fs/promises";

/**
 * When the active log at `logPath` reaches `maxBytes`, rotate:
 * `logPath` → `logPath.1`, previous `.1` → `.2`, … delete `logPath.${maxRotatedFiles}`.
 * Creates a new empty `logPath`. No-op if `maxBytes` ≤ 0 or file missing / already small enough.
 */
export async function rotateLogFileIfNeeded(
  logPath: string,
  maxBytes: number,
  maxRotatedFiles: number,
): Promise<void> {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    return;
  }
  const k = Number.isFinite(maxRotatedFiles) && maxRotatedFiles >= 1 ? Math.floor(maxRotatedFiles) : 8;
  let size = 0;
  try {
    size = (await stat(logPath)).size;
  } catch {
    return;
  }
  if (size < maxBytes) {
    return;
  }

  const oldest = `${logPath}.${k}`;
  try {
    await unlink(oldest);
  } catch {
    // absent is fine
  }

  for (let i = k - 1; i >= 1; i -= 1) {
    const from = `${logPath}.${i}`;
    const to = `${logPath}.${i + 1}`;
    try {
      await rename(from, to);
    } catch {
      // from may not exist
    }
  }

  try {
    await rename(logPath, `${logPath}.1`);
  } catch {
    return;
  }
  await writeFile(logPath, "", "utf8");
}
