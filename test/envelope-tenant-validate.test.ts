import { describe, expect, it } from "vitest";
import { validateEnvelope } from "../src/contracts/validate.js";

describe("validateEnvelope tenant fields", () => {
  const base = {
    traceId: "t1",
    channel: "telegram" as const,
    chatId: "1",
    messageId: "2",
    receivedAtIso: new Date().toISOString(),
    text: "hi",
  };

  it("accepts valid tenantId on envelope", () => {
    const e = validateEnvelope({ ...base, tenantId: "acme-corp" });
    expect(e.tenantId).toBe("acme-corp");
  });

  it("metadata.tenantId overrides envelope.tenantId", () => {
    const e = validateEnvelope({
      ...base,
      tenantId: "a",
      metadata: { tenantId: "b" },
    });
    expect(e.metadata?.tenantId).toBe("b");
  });

  it("rejects tenant id with path separators", () => {
    expect(() => validateEnvelope({ ...base, tenantId: "bad/id" })).toThrow();
  });

  it("rejects tenant id over 128 chars", () => {
    expect(() => validateEnvelope({ ...base, tenantId: "x".repeat(129) })).toThrow();
  });
});
