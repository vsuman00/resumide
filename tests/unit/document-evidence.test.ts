import { describe, expect, it } from "vitest";
import { buildNativeEvidence } from "../../app/lib/server/native-evidence";
import {
  DocumentEvidenceSchema,
  reconcileDocumentEvidence,
} from "../../app/lib/server/document-evidence";

const context = {
  id: "10000000-0000-4000-8000-000000000001",
  ownerId: "10000000-0000-4000-8000-000000000002",
  analysisId: "10000000-0000-4000-8000-000000000003",
  sourceId: "10000000-0000-4000-8000-000000000004",
  inputSha256: "a".repeat(64),
  createdAt: "2026-10-11T00:00:00.000Z",
  retentionPolicyId: "synthetic-local-30d/1.0.0",
};
describe("immutable document reconciliation", () => {
  it("preserves native source text, explicit uncertainty and all critical fields", () => {
    const source = buildNativeEvidence([
      "Name: Demo Person\nEmployer: Fictional Co\nEmployer: Other Fictional Co",
    ]);
    const original = structuredClone(source);
    const result = reconcileDocumentEvidence(context, source);
    expect(result.nativeSource).toEqual(original);
    expect(source).toEqual(original);
    expect(result.scoringEligible).toBe(false);
    expect(result.fields.find((item) => item.field === "employer")?.state).toBe(
      "conflict",
    );
    expect(result.blockers).toContain("conflicting_critical_fields");
    expect(result.fields).toHaveLength(8);
  });
  it.each([
    { text: "", status: "insufficient", error: null },
    { text: "", status: "unsupported", error: { code: "unsupported" } },
    { text: "Native text", status: "failed", error: { code: "timeout" } },
  ])("fails closed for $status", ({ text, status, error }) => {
    const result = reconcileDocumentEvidence(
      context,
      buildNativeEvidence([text]),
      null,
      error,
    );
    expect(result.status).toBe(status);
    expect(result.scoringEligible).toBe(false);
  });
  it.each(["scoring", "span", "value", "confidence"])(
    "rejects forged derived %s",
    (mutation) => {
      const result = reconcileDocumentEvidence(
        context,
        buildNativeEvidence(["Employer: Fictional Co"]),
      );
      const forged: Record<string, unknown> = structuredClone(result);
      if (mutation === "scoring") forged.scoringEligible = true;
      if (mutation === "span")
        (forged.spans as typeof result.spans)[0].text = "Invented text";
      if (mutation === "value")
        (forged.assertions as typeof result.assertions)[0].value =
          "Invented fact";
      if (mutation === "confidence")
        forged.confidence = { kind: "calibrated", value: 1 };
      expect(DocumentEvidenceSchema.safeParse(forged).success).toBe(false);
    },
  );
});
