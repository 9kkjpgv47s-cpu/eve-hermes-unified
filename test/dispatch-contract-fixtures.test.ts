import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UNIFIED_DISPATCH_CONTRACT_SCHEMA_REF,
  UNIFIED_DISPATCH_CONTRACT_VERSION,
} from "../src/contracts/dispatch-contract.js";
import type { UnifiedDispatchResult } from "../src/contracts/types.js";
import { validateUnifiedDispatchResult } from "../src/contracts/validate.js";

describe("Unified dispatch contract fixtures (H4)", () => {
  it("accepts versioned v1 pass fixture", async () => {
    const fixturePath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures",
      "unified-dispatch-v1-pass.json",
    );
    const raw = await readFile(fixturePath, "utf8");
    const parsed = JSON.parse(raw) as UnifiedDispatchResult;
    const validated = validateUnifiedDispatchResult(parsed);
    expect(validated.contractVersion).toBe(UNIFIED_DISPATCH_CONTRACT_VERSION);
    expect(validated.contractSchemaRef).toBe(UNIFIED_DISPATCH_CONTRACT_SCHEMA_REF);
    expect(validated.primaryState.traceId).toBe(validated.envelope.traceId);
  });
});
