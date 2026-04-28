import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["sources/**", "node_modules/**", "dist/**"],
    globalSetup: ["./test/global-setup.ts"],
  },
});
