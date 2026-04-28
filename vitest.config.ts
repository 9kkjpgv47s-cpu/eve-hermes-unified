import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/vitest-setup.ts"],
    include: ["test/**/*.test.ts"],
    exclude: ["sources/**", "node_modules/**", "dist/**"],
  },
});
