import { describe, expect, it, vi } from "vitest";
import { assertWorkerSchemaReady } from "../../app/lib/server/worker-readiness";

describe("worker schema readiness", () => {
  it("checks score and correction storage before claiming work", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ error: null }),
    };
    const client = { from: vi.fn(() => query) };
    await assertWorkerSchemaReady(client as never);
    expect(client.from.mock.calls).toEqual([
      ["document_evidence_attempts"],
      ["evidence_corrections"],
    ]);
    expect(query.limit).toHaveBeenCalledWith(0);
  });
  it("stops on missing storage without exposing provider error content", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      limit: vi
        .fn()
        .mockResolvedValue({ error: { message: "private-provider-detail" } }),
    };
    const client = { from: vi.fn(() => query) };
    await expect(assertWorkerSchemaReady(client as never)).rejects.toThrow(
      "migration 20261011140000",
    );
    expect(client.from).toHaveBeenCalledTimes(1);
  });
});
