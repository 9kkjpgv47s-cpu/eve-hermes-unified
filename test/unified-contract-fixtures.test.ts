import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateUnifiedDispatchResult } from "../src/contracts/validate.js";
import type { UnifiedDispatchResult } from "../src/contracts/types.js";
import { UNIFIED_DISPATCH_CONTRACT_VERSION } from "../src/contracts/schema-version.js";

const fixtureDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures/contracts");

describe("Unified dispatch contract fixtures", () => {
  it("exports a pinned contract version constant", () => {
    expect(UNIFIED_DISPATCH_CONTRACT_VERSION).toBe("v1");
  });

  it("validates unified-dispatch-result-v1-pass.json against unified dispatch schema validators", async () => {
    const raw = await readFile(path.join(fixtureDir, "unified-dispatch-result-v1-pass.json"), "utf8");
    const parsed = JSON.parse(raw) as UnifiedDispatchResult;
    expect(() => validateUnifiedDispatchResult(parsed)).not.toThrow();
  });
});
