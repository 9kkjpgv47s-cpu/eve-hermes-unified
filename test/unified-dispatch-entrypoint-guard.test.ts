import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

async function listTsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const names = await readdir(dir, { withFileTypes: true });
  for (const ent of names) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await listTsFiles(full)));
    } else if (ent.isFile() && (ent.name.endsWith(".ts") || ent.name.endsWith(".tsx"))) {
      out.push(full);
    }
  }
  return out;
}

describe("unified-dispatch entrypoint guard (H4)", () => {
  it("constructs lane adapters only in unified-dispatch CLI", async () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const unifiedDispatchPath = path.join(root, "src/bin/unified-dispatch.ts");
    const srcRoot = path.join(root, "src");
    const files = await listTsFiles(srcRoot);
    const offenders: string[] = [];
    for (const full of files) {
      if (full === unifiedDispatchPath) {
        continue;
      }
      const text = await readFile(full, "utf8");
      if (/new\s+EveAdapter\s*\(/.test(text) || /new\s+HermesAdapter\s*\(/.test(text)) {
        offenders.push(path.relative(root, full));
      }
    }
    expect(
      offenders,
      `Lane adapters must not be constructed outside ${path.relative(root, unifiedDispatchPath)}`,
    ).toEqual([]);
  });
});
