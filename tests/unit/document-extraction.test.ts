import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { extractDocumentForReview } from "../../app/lib/server/document-extraction";
const bytes = new Uint8Array([1, 2, 3]);
const args = {
  bytes,
  maxBytes: 100,
  maxPages: 10,
  maxCharacters: 10000,
  timeoutMs: 50,
  context: {
    id: "10000000-0000-4000-8000-000000000001",
    ownerId: "10000000-0000-4000-8000-000000000002",
    analysisId: "10000000-0000-4000-8000-000000000003",
    sourceId: "10000000-0000-4000-8000-000000000004",
    inputSha256: createHash("sha256").update(bytes).digest("hex"),
    createdAt: "2026-10-11T00:00:00.000Z",
    retentionPolicyId: "resume-retention-v1",
  },
};
describe("document review extraction boundary", () => {
  it("preserves mixed native pages and withholds scores without approved OCR", async () => {
    const text = "Name: Jane Doe\nEmail: jane@example.com";
    const evidence = await extractDocumentForReview(
      args,
      vi.fn().mockResolvedValue({ totalPages: 2, text, pageTexts: [text, ""] }),
    );
    expect(evidence.nativeSource.pages.map((p) => p.text)).toEqual([text, ""]);
    expect(evidence.status).toBe("unsupported");
    expect(evidence.scoringEligible).toBe(false);
    expect(evidence.blockers).toContain("missing_ocr_pages");
  });
  it("never invokes extraction for altered bytes", async () => {
    const extractor = vi.fn();
    await expect(
      extractDocumentForReview(
        { ...args, bytes: new Uint8Array([4]) },
        extractor,
      ),
    ).rejects.toThrow("checksum");
    expect(extractor).not.toHaveBeenCalled();
  });
  it("bounds the native extraction deadline", async () => {
    await expect(
      extractDocumentForReview(
        { ...args, timeoutMs: 5 },
        vi.fn(() => new Promise<never>(() => {})),
      ),
    ).rejects.toThrow("timeout");
  });
  it("native presence still requires uncalibrated review", async () => {
    const evidence = await extractDocumentForReview(
      args,
      vi.fn().mockResolvedValue({
        totalPages: 1,
        text: "Jane Smith",
        pageTexts: ["Jane Smith"],
      }),
    );
    expect(evidence.status).toBe("review_required");
    expect(evidence.scoringEligible).toBe(false);
  });
});
