import { access, constants } from "node:fs/promises";

export async function assertPathsExist(
  paths: ReadonlyArray<{ label: string; path: string }>,
): Promise<void> {
  for (const { label, path: p } of paths) {
    if (!p.trim()) {
      throw new Error(`${label} path is empty.`);
    }
    try {
      await access(p, constants.F_OK);
    } catch {
      throw new Error(`${label} not found or not readable: ${p}`);
    }
  }
}
