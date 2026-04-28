import { describe, expect, it } from "vitest";
import { resolvePackageRoot } from "../src/config/package-root.js";

describe("resolvePackageRoot", () => {
  it("finds repo root from src path", () => {
    const root = resolvePackageRoot(import.meta.url);
    expect(root.endsWith("workspace") || root.includes("eve-hermes-unified")).toBe(true);
  });
});
