import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["sources/**", "node_modules/**", "dist/**"],
    /** Integration tests share `evidence/` under the repo root; run serially to avoid cross-test races. */
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
