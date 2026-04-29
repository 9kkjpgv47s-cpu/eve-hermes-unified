import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["sources/**", "node_modules/**", "dist/**"],
    /** Evidence-writing integration tests race when parallel workers mutate shared `evidence/`. */
    maxConcurrency: 1,
  },
});
