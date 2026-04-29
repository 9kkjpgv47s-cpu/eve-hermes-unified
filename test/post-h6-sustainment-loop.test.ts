import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("run-post-h6-sustainment-loop.mjs (legacy)", () => {
  it("npm script verify:sustainment-loop:h6-legacy invokes post-H6 loop", async () => {
    const pkgRaw = await readFile(path.join(repoRoot, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { scripts?: Record<string, string> };
    expect(pkg.scripts?.["verify:sustainment-loop:h6-legacy"]).toContain("run-post-h6-sustainment-loop.mjs");
  });
});
