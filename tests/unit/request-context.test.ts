import { describe, expect, it } from "vitest";
import {
  createRequestId,
  getOrCreateRequestId,
  requestIdFrom,
} from "~/lib/server/request-context";

describe("request context", () => {
  it("uses the server-stamped request id", () => {
    const request = new Request("https://resumide.example/healthz", {
      headers: { "X-Request-Id": "request-1234" },
    });
    expect(requestIdFrom(request)).toBe("request-1234");
  });

  it("creates a fresh id when the inbound id is missing or unsafe", () => {
    const missing = requestIdFrom(
      new Request("https://resumide.example/healthz"),
    );
    const unsafe = requestIdFrom(
      new Request("https://resumide.example/healthz", {
        headers: { "X-Request-Id": "bad id with spaces" },
      }),
    );
    expect(missing).toMatch(/^[0-9a-f-]{36}$/u);
    expect(unsafe).toMatch(/^[0-9a-f-]{36}$/u);
    expect(unsafe).not.toBe("bad id with spaces");
  });

  it("keeps the existing id validation contract", () => {
    expect(getOrCreateRequestId("safe-request-id")).toBe("safe-request-id");
    expect(getOrCreateRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/u);
    expect(createRequestId()).toMatch(/^[0-9a-f-]{36}$/u);
  });
});
