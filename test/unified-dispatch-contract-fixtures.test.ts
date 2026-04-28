import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { UnifiedDispatchResult } from "../src/contracts/types.js";
import { UNIFIED_DISPATCH_CONTRACT_VERSION } from "../src/contracts/types.js";
import { validateUnifiedDispatchResult } from "../src/contracts/validate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadFixture(name: string): Promise<unknown> {
  const p = path.join(__dirname, "fixtures", name);
  return JSON.parse(await readFile(p, "utf8")) as unknown;
}

describe("Unified dispatch contract v1 fixtures", () => {
  it("accepts canonical primary-pass fixture", async () => {
    const raw = await loadFixture("unified-dispatch-result-v1-primary-pass.json");
    const parsed = validateUnifiedDispatchResult(raw as UnifiedDispatchResult);
    expect(parsed.contractVersion).toBe(UNIFIED_DISPATCH_CONTRACT_VERSION);
    expect(parsed.envelope.traceId).toBe("fixture-trace-primary-pass");
    expect(parsed.primaryState.status).toBe("pass");
  });

  it("rejects fixture with wrong contractVersion", async () => {
    const raw = await loadFixture("unified-dispatch-result-v1-primary-pass.json");
    const broken = { ...(raw as object), contractVersion: "v0" };
    expect(() => validateUnifiedDispatchResult(broken as UnifiedDispatchResult)).toThrow(
      "contractVersion must be exactly v1",
    );
  });
});
