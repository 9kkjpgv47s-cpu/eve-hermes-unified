import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  UNIFIED_DISPATCH_CONTRACT_SCHEMA_REF,
  UNIFIED_DISPATCH_CONTRACT_VERSION,
} from "../src/contracts/dispatch-contract.js";
import { validateUnifiedDispatchResult } from "../src/contracts/validate.js";

describe("H4 dispatch contract fixture", () => {
  it("validates fixture JSON against contract fields", async () => {
    const raw = await readFile(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "unified-dispatch-v1-pass.json"),
      "utf8",
    );
    const parsed = JSON.parse(raw) as Parameters<typeof validateUnifiedDispatchResult>[0];
    const validated = validateUnifiedDispatchResult(parsed);
    expect(validated.contractVersion).toBe(UNIFIED_DISPATCH_CONTRACT_VERSION);
    expect(validated.contractSchemaRef).toBe(UNIFIED_DISPATCH_CONTRACT_SCHEMA_REF);
  });
});
