import { describe, expect, it, vi } from "vitest";
import { hasUncalibratedEvidence } from "../../app/lib/server/evidence-scoring-guard";
describe("uncalibrated score guard", () => {
  it.each([{ data: [] }, { data: [{ id: "attempt" }] }])(
    "checks stored attempts independently of flags",
    async ({ data }) => {
      const query = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data, error: null }),
      };
      const client = { from: vi.fn(() => query) };
      expect(await hasUncalibratedEvidence(client as never, "analysis")).toBe(
        data.length > 0,
      );
      expect(client.from).toHaveBeenCalledWith("document_evidence_attempts");
      expect(query.eq).toHaveBeenCalledWith("analysis_id", "analysis");
    },
  );
  it("fails closed on unavailable storage", async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: null, error: {} }),
    };
    await expect(
      hasUncalibratedEvidence({ from: () => query } as never, "analysis"),
    ).rejects.toThrow("unavailable");
  });
});
