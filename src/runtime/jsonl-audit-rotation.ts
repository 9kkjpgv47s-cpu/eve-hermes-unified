import { readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * When the log grows past maxBytesBeforeRotate, move the full file to `<path>.1`
 * and replace the primary with the tail (last retainBytesAfterRotate bytes, line-aligned).
 */
export async function maybeRotateJsonlLogInPlace(
  logPath: string,
  maxBytesBeforeRotate: number,
  retainBytesAfterRotate: number,
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

  try {
    await rm(rotatedPath, { force: true });
  } catch {
    // ignore
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
    throw new Error(`jsonl_audit_rotate_failed:${logPath}`);
  }
}
