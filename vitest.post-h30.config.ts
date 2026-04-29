import { defineConfig } from "vitest/config";

/** Dedicated config so **`post-h30`** sustainment tests run without the default exclude that prevents recursion inside **`validate:all`**. */
export default defineConfig({
  test: {
    include: ["test/post-h30-sustainment-loop.test.ts"],
    exclude: ["sources/**", "node_modules/**", "dist/**"],
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
