/**
 * Pick the newest matching file under `dir` by modification time (not lexicographic order).
 * Evidence filenames often embed ISO timestamps where string sort ≠ chronological order across month/year boundaries.
 */
import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export async function newestMatchingEvidenceFile(dir, prefix, suffix = ".json") {
  const entries = await readdir(dir, { withFileTypes: true });
  let bestPath = "";
  let bestMtime = -1;
  for (const e of entries) {
    if (!e.isFile() || !e.name.startsWith(prefix) || !e.name.endsWith(suffix)) {
      continue;
    }
    const full = path.join(dir, e.name);
    try {
      const s = await stat(full);
      const m = s.mtimeMs;
      if (m >= bestMtime) {
        bestMtime = m;
        bestPath = full;
      }
    } catch {
      // skip unreadable entries
    }
  }
  return bestPath;
}
