import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["sources/**", "node_modules/**", "dist/**"],
    /** Evidence-writing integration tests share repo `evidence/`; run files sequentially. */
    fileParallelism: false,
    /** Avoid saturating the host when many files run one after another. */
    maxConcurrency: 1,
  },
});
