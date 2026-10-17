import { expect, it } from "vitest";
import legacy from "../fixtures/evidence-fields-v1-envelope.json";
import {
  DocumentEvidenceSchema,
  reconcileDocumentEvidence,
  FIELD_EXTRACTOR_VERSION,
} from "../../app/lib/server/document-evidence";
it("replays historical evidence with its original parser while versioning new assertions", () => {
  expect(DocumentEvidenceSchema.parse(legacy)).toEqual(legacy);
  const {
    id,
    ownerId,
    analysisId,
    sourceId,
    inputSha256,
    createdAt,
    retentionPolicyId,
  } = legacy;
  const next = reconcileDocumentEvidence(
    {
      id,
      ownerId,
      analysisId,
      sourceId,
      inputSha256,
      createdAt,
      retentionPolicyId,
    },
    legacy.nativeSource,
  );
  expect(next.fieldExtractorVersion).toBe(FIELD_EXTRACTOR_VERSION);
  expect(next.assertions.length).toBeGreaterThan(legacy.assertions.length);
  expect(next.scoringEligible).toBe(false);
  const missingVersion = structuredClone(next);
  delete missingVersion.fieldExtractorVersion;
  expect(DocumentEvidenceSchema.safeParse(missingVersion).success).toBe(false);
  expect(
    DocumentEvidenceSchema.safeParse({
      ...next,
      fieldExtractorVersion: "unknown",
    }).success,
  ).toBe(false);
});
