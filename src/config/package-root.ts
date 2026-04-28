import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Walk upward until `package.json` exists (works for `src/` and `dist/`). */
export function resolvePackageRoot(fromImportMetaUrl: string | URL): string {
  let dir = dirname(fileURLToPath(fromImportMetaUrl));
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(join(dir, "package.json"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error("Could not locate package.json from this module path.");
}
