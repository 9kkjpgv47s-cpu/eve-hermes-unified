import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { UnifiedDispatchResult } from "../src/contracts/types.js";
import { UNIFIED_DISPATCH_CONTRACT_VERSION } from "../src/contracts/schema-version.js";
import { validateUnifiedDispatchResult } from "../src/contracts/validate.js";

const fixtureDir = dirname(fileURLToPath(import.meta.url));

describe("unified dispatch contract fixtures", () => {
  it("exports current contract version", () => {
    expect(UNIFIED_DISPATCH_CONTRACT_VERSION).toBe("v1");
  });

  it("validates v1 pass fixture against validateUnifiedDispatchResult", () => {
    const raw = readFileSync(join(fixtureDir, "fixtures/contracts/unified-dispatch-result-v1-pass.json"), "utf8");
    const parsed = JSON.parse(raw) as UnifiedDispatchResult;
    expect(() => validateUnifiedDispatchResult(parsed)).not.toThrow();
    const result = validateUnifiedDispatchResult(parsed);
    expect(result.envelope.traceId).toBe("fixture-trace-v1");
    expect(result.response.traceId).toBe("fixture-trace-v1");
  });
});
