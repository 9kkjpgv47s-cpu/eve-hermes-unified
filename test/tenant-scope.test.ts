import { describe, expect, it } from "vitest";
import { resolveEnvelopeTenantId } from "../src/runtime/tenant-scope.js";

describe("resolveEnvelopeTenantId", () => {
  it("prefers metadata.tenantId over envelope.tenantId", () => {
    expect(
      resolveEnvelopeTenantId({
        traceId: "t",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: "x",
        text: "hi",
        tenantId: "from-field",
        metadata: { tenantId: "from-meta" },
      }),
    ).toBe("from-meta");
  });

  it("uses envelope.tenantId when metadata absent", () => {
    expect(
      resolveEnvelopeTenantId({
        traceId: "t",
        channel: "telegram",
        chatId: "1",
        messageId: "2",
        receivedAtIso: "x",
        text: "hi",
        tenantId: "acme",
      }),
    ).toBe("acme");
  });
});
