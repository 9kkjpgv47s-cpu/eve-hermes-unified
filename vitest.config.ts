import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: [
      "sources/**",
      "node_modules/**",
      "dist/**",
      /** Runs inside **`npm run validate:all`** via **`run-h30-assurance-bundle`** — excluded from default **`npm test`** to avoid recursion. */
      "**/post-h30-sustainment-loop.test.ts",
    ],
    /** Integration tests share `evidence/` under the repo root; run serially to avoid cross-test races. */
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
