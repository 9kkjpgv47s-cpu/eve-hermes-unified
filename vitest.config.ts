import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: { VITEST: "true" },
    include: ["test/**/*.test.ts"],
    exclude: ["sources/**", "node_modules/**", "dist/**"],
  },
});
